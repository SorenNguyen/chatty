#!/usr/bin/env bash
#
# Exercises a running Chatty against its real HTTP API: register, chat, edit,
# delete, and ask for a password reset.
#
# This is the half `npm run verify` cannot do. A green suite means the types
# agree and the units behave; it does not mean the deployment works. Phase 2
# shipped an avatar endpoint that returned 500 for every request with all 75
# server tests passing, because Express refuses a path containing a dot segment
# and the upload directory was `.data/uploads`. Nothing that tests a service can
# see that. This can.
#
# Read-only about other people's data and destructive about nothing: it creates
# one throwaway account per run and touches only its own conversation. Safe to
# point at production, which is the point — run it immediately after a deploy.
#
#   scripts/smoke.sh                       # against http://localhost:4000
#   scripts/smoke.sh https://api.chatty.example
#
# Exit code is 0 only if every check passed.

set -uo pipefail

API="${1:-http://localhost:4000}"
SUFFIX="$(date +%s)$RANDOM"
PASSWORD="SuperSecret123"
EMAIL="smoke$SUFFIX@chatty.test"
PEER_EMAIL="smokepeer$SUFFIX@chatty.test"

failures=0
checks=0

# `check <name> <expected> <actual>` — prints one line, records a failure.
check() {
	checks=$((checks + 1))
	if [ "$2" = "$3" ]; then
		printf '  \033[32mok\033[0m   %-46s %s\n' "$1" "$3"
	else
		printf '  \033[31mFAIL\033[0m %-46s got %s, wanted %s\n' "$1" "$3" "$2"
		failures=$((failures + 1))
	fi
}

# Body of a request, or the HTTP status when only that matters.
api() { curl -s -X "$1" "$API$2" -H 'Content-Type: application/json' ${3:+-d "$3"} ${TOKEN:+-H "Authorization: Bearer $TOKEN"}; }
status() { curl -s -o /dev/null -w '%{http_code}' -X "$1" "$API$2" -H 'Content-Type: application/json' ${3:+-d "$3"} ${TOKEN:+-H "Authorization: Bearer $TOKEN"}; }
json() { python3 -c "import sys,json;d=json.load(sys.stdin);print($1)" 2>/dev/null || echo "PARSE_ERROR"; }

TOKEN=""

echo
echo "smoke: $API"
echo

echo "health"
check "liveness" "200" "$(status GET /health)"
check "readiness" "200" "$(status GET /ready)"
check "database reachable" "ok" "$(api GET /ready | json 'd["checks"]["database"]')"

echo
echo "accounts"
# One request, both halves of the answer. Asking for the status separately would
# register twice and make the second attempt a conflict.
REGISTER_RAW=$(curl -s -w '\n%{http_code}' -X POST "$API/auth/register" -H 'Content-Type: application/json' \
	-d "{\"email\":\"$EMAIL\",\"password\":\"$PASSWORD\",\"handle\":\"smoke$SUFFIX\",\"displayName\":\"Smoke\"}")
REGISTER_STATUS=$(echo "$REGISTER_RAW" | tail -1)
REGISTER=$(echo "$REGISTER_RAW" | sed '$d')

# Every check below needs an account, so a rate-limited registration would
# otherwise cascade into ten unrelated-looking failures. It is also the most
# likely reason for a rerun to fail: registration is deliberately limited, the
# counter is shared across instances once Redis is in play, and this script
# creates two accounts each time. Say so plainly and stop.
if [ "$REGISTER_STATUS" = "429" ]; then
	printf '  \033[33mskip\033[0m registration is rate limited (429)\n\n'
	echo "  Not a failure of the deployment — the limiter is working, and this"
	echo "  script creates two accounts per run. Wait a minute and run it again."
	echo
	exit 2
fi

TOKEN=$(echo "$REGISTER" | json 'd["token"]')
check "register returns a token" "yes" "$([ -n "$TOKEN" ] && [ "$TOKEN" != "PARSE_ERROR" ] && echo yes || echo no)"
check "the token identifies the account" "$EMAIL" "$(api GET /users/me | json 'd["email"]')"

PEER=$(TOKEN="" api POST /auth/register "{\"email\":\"$PEER_EMAIL\",\"password\":\"$PASSWORD\",\"handle\":\"peer$SUFFIX\",\"displayName\":\"Peer\"}")
PEER_ID=$(echo "$PEER" | json 'd["user"]["id"]')
check "a second account exists to talk to" "yes" "$([ -n "$PEER_ID" ] && [ "$PEER_ID" != "PARSE_ERROR" ] && echo yes || echo no)"

echo
echo "messages"
CONV=$(api POST /conversations "{\"participantIds\":[\"$PEER_ID\"]}" | json 'd["id"]')
check "a direct conversation is created" "yes" "$([ -n "$CONV" ] && [ "$CONV" != "PARSE_ERROR" ] && echo yes || echo no)"

MSG=$(api POST "/conversations/$CONV/messages" '{"content":"smoke test"}')
MSG_ID=$(echo "$MSG" | json 'd["id"]')
check "a message is stored" "smoke test" "$(echo "$MSG" | json 'd["content"]')"

EDITED=$(curl -s -X PATCH "$API/conversations/$CONV/messages/$MSG_ID" -H 'Content-Type: application/json' -H "Authorization: Bearer $TOKEN" -d '{"content":"smoke test, edited"}')
check "an edit replaces the text" "smoke test, edited" "$(echo "$EDITED" | json 'd["content"]')"
check "an edit is marked as one" "yes" "$(echo "$EDITED" | json '"yes" if d["editedAt"] else "no"')"

DELETED=$(curl -s -X DELETE "$API/conversations/$CONV/messages/$MSG_ID" -H "Authorization: Bearer $TOKEN")
check "a delete empties the text" "" "$(echo "$DELETED" | json 'd["content"]')"
check "a delete leaves a tombstone" "yes" "$(echo "$DELETED" | json '"yes" if d["deletedAt"] else "no"')"
# The tombstone must survive in the list: read markers and the paging cursor
# point at it. A hard delete would pass every check above and fail this one.
check "the tombstone keeps its place" "1" "$(api GET "/conversations/$CONV/messages?limit=10" | json 'len(d)')"

echo
echo "mail"
# 204 whether or not the address exists — that is the whole design, so this
# cannot confirm delivery. What it confirms is that the endpoint is reachable
# and the write path behind it did not throw.
check "a reset is accepted" "204" "$(TOKEN="" status POST /auth/password-reset "{\"email\":\"$EMAIL\"}")"
check "an unknown address answers the same" "204" "$(TOKEN="" status POST /auth/password-reset '{"email":"nobody@chatty.test"}')"

echo
echo "authorization"
check "an unauthenticated read is refused" "401" "$(TOKEN="" status GET /users/me)"
check "a made-up conversation is not found" "404" "$(status GET /conversations/does-not-exist/messages)"

echo
if [ "$failures" -eq 0 ]; then
	printf '\033[32m%s/%s checks passed\033[0m\n\n' "$checks" "$checks"
	exit 0
fi

printf '\033[31m%s of %s checks failed\033[0m\n\n' "$failures" "$checks"
exit 1
