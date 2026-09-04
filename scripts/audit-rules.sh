#!/usr/bin/env bash
# audit-rules.sh — check a TypeScript codebase against the project rules.
#
# From "Dev Rules" by Trần Anh Tuấn (evondev), MIT licensed. Adapted for chatty:
# the default source folder is apps/web/src (this is a monorepo, and these checks
# target the React app — apps/server follows docs/conventions/backend.md instead).
#
# Usage:
#   bash scripts/audit-rules.sh               # audits apps/web/src, reads ./CLAUDE.md
#   bash scripts/audit-rules.sh path/to/src   # other source folder
#   bash scripts/audit-rules.sh apps/web/src --config CLAUDE.md
#
# Prints one section per rule with the offending file:line entries and a count.
# Exit code is 0 either way: this is a report, not a gate. Pipe it into a file
# or paste it back to your agent and ask it to fix a section at a time.
#
# Reads the "Conventions" block of the project rules file (default ./CLAUDE.md,
# falls back to ./AGENTS.md) and turns off sections that do not apply: raw
# <button> allowed → section 4 off, raw <img> allowed → 5 off, no styling
# helper → 8/9 off, React 18 → 10 off, "type over interface" → 13 off,
# non-Next framework → 7 uses a generic check. No config → everything on.
#
# Only needs bash + grep + find (BSD or GNU). Heuristic by design: a hit is a
# place worth a look, not a verdict.

set -uo pipefail

SRC="apps/web/src"
CONFIG=""
GATE=0
while [ $# -gt 0 ]; do
  case "$1" in
    --config) CONFIG="$2"; shift 2 ;;
    --gate) GATE=1; shift ;;
    *) SRC="$1"; shift ;;
  esac
done

if [ ! -d "$SRC" ]; then
  echo "No such directory: $SRC" >&2
  exit 1
fi

if [ -z "$CONFIG" ]; then
  if [ -f "CLAUDE.md" ]; then CONFIG="CLAUDE.md"; elif [ -f "AGENTS.md" ]; then CONFIG="AGENTS.md"; fi
fi

# Read one convention value: the text between backticks on the "- Key:" line.
convention() {
  [ -n "$CONFIG" ] && [ -f "$CONFIG" ] || return 0
  # The sed program needs literal backticks and capture syntax; shell expansion
  # here would change the expression rather than make it safer.
  # shellcheck disable=SC2016
  grep -iE "^- $1:" "$CONFIG" | head -1 | sed -E 's/^[^`]*`([^`]*)`.*$/\1/'
}

lower() { printf '%s' "$1" | tr '[:upper:]' '[:lower:]'; }

CONV_FRAMEWORK="$(lower "$(convention 'Framework')")"
CONV_BUTTON="$(lower "$(convention 'Button')")"
CONV_IMAGES="$(lower "$(convention 'Images')")"
CONV_STYLING="$(lower "$(convention 'Styling helper')")"
CONV_TYPES="$(lower "$(convention 'Types')")"
CONV_REACT="$(lower "$(convention 'React version')")"

is_off() { printf '  \033[2mSKIPPED — %s\033[0m\n' "$1"; }

if [ -n "$CONFIG" ] && [ -f "$CONFIG" ]; then
  printf '\033[2mConventions read from %s\033[0m\n' "$CONFIG"
else
  printf '\033[2mNo project rules file found; running every section with defaults.\033[0m\n'
fi

# Total is accumulated in a temp file: `report` runs at the end of a pipe, i.e.
# in a subshell, so a plain shell variable would never make it back here.
TOTAL_FILE="$(mktemp)"
echo 0 > "$TOTAL_FILE"
trap 'rm -f "$TOTAL_FILE"' EXIT

section() {
  printf '\n\033[1m== %s\033[0m\n' "$1"
}

report() {
  # stdin = list of hits
  local hits count total
  hits="$(cat)"
  count="$(printf '%s' "$hits" | grep -c . || true)"
  total="$(cat "$TOTAL_FILE")"
  echo $((total + count)) > "$TOTAL_FILE"
  if [ "$count" -eq 0 ]; then
    printf '  \033[32mOK\033[0m — no hits\n'
  else
    printf '%s\n' "$hits" | sed 's/^/  /'
    printf '  \033[33m%s hit(s)\033[0m\n' "$count"
  fi
}

ts_files() {
  find "$SRC" -type f \( -name "*.ts" -o -name "*.tsx" \) -not -path "*/node_modules/*"
}

tsx_files() {
  find "$SRC" -type f -name "*.tsx" -not -path "*/node_modules/*"
}

# ---------------------------------------------------------------------------
section "1. Filenames must be kebab-case (.ts / .tsx)"
ts_files | grep -vE '/[a-z0-9]+(-[a-z0-9]+)*(\.[a-z0-9]+)*\.tsx?$' | grep -v '\[' | report

# ---------------------------------------------------------------------------
section "2. src/app route folders: only page/route/layout/loading/error files (Next.js)"
if [ -n "$CONV_FRAMEWORK" ] && [ "${CONV_FRAMEWORK#*next}" = "$CONV_FRAMEWORK" ]; then
  is_off "framework is $CONV_FRAMEWORK, not Next.js"
elif [ -d "$SRC/app" ]; then
  find "$SRC/app" -type f \
    | grep -vE '/(page|route|layout|loading|error|not-found|template|default|robots|sitemap|manifest|icon|apple-icon|opengraph-image|twitter-image|globals)\.(tsx?|css|png|ico|svg)$' \
    | grep -v '\.d\.ts$' | report
else
  echo "  (no $SRC/app folder)"
fi

# ---------------------------------------------------------------------------
section "3. No imports across features (features/A importing @/features/B)"
if [ -d "$SRC/features" ]; then
  grep -rn 'from "@/features/' "$SRC/features" --include='*.ts' --include='*.tsx' 2>/dev/null \
    | awk -F: '{
        n = split($1, parts, "/");
        for (k = 1; k <= n; k++) if (parts[k] == "features") { feature = parts[k+1]; break }
        if ($0 !~ ("@/features/" feature "/")) print
      }' | report
else
  echo "  (no $SRC/features folder)"
fi

# ---------------------------------------------------------------------------
section "4. No raw <button> (use the project's Button component)"
case "$CONV_BUTTON" in
  *"raw <button>"*|*"raw button"*) is_off "project allows raw <button>" ;;
  *) tsx_files | xargs grep -n '<button' 2>/dev/null \
       | grep -vE "/components/(button|glow-button|tag)/" | report ;;
esac

# ---------------------------------------------------------------------------
section "5. No <img> (use the project's image component)"
case "$CONV_IMAGES" in
  *"raw <img>"*|*"raw img"*) is_off "project allows raw <img>" ;;
  *) tsx_files | xargs grep -n '<img' 2>/dev/null | report ;;
esac

# ---------------------------------------------------------------------------
section "6. No inline <svg> outside src/components/icons (data charts are OK, comment them)"
tsx_files | xargs grep -ln '<svg' 2>/dev/null | grep -v '/components/icons/' | report

# ---------------------------------------------------------------------------
section "7. No <a> for internal links (use the framework's Link)"
tsx_files | xargs grep -n '<a ' 2>/dev/null \
  | grep -v 'http\|mailto:\|tel:\|target=' | report

# ---------------------------------------------------------------------------
section "8. className: no array .join(\" \")"
case "$CONV_STYLING" in
  none*) is_off "no styling helper declared" ;;
  *) tsx_files | xargs grep -n "\]\.join(\" \")\|\]\.join(' ')" 2>/dev/null | report ;;
esac

# ---------------------------------------------------------------------------
section "9. className: no template string with ternary (use the styling helper)"
case "$CONV_STYLING" in
  none*) is_off "no styling helper declared" ;;
  *)
    # `${` is the source text this heuristic is searching for, not a shell variable.
    # shellcheck disable=SC2016
    tsx_files | xargs grep -n 'className={`[^`]*\${[^}]*?[^}]*:' 2>/dev/null | report
    ;;
esac

# ---------------------------------------------------------------------------
section "10. No React.FormEvent / FormEventHandler (deprecated in React 19)"
case "$CONV_REACT" in
  18*|17*|16*) is_off "React $CONV_REACT still uses FormEvent" ;;
  *) ts_files | xargs grep -n 'React\.FormEvent\|FormEventHandler' 2>/dev/null | report ;;
esac

# ---------------------------------------------------------------------------
section "11. Props interface must be <ComponentName>Props, not generic Props"
tsx_files | xargs grep -nE '^(export )?(interface|type) Props\b' 2>/dev/null | report

# ---------------------------------------------------------------------------
section "12. No inline object type in a component signature"
tsx_files | xargs grep -nE 'function [A-Z][A-Za-z]+\(\{[^}]*\}: \{' 2>/dev/null | report

# ---------------------------------------------------------------------------
section "13. Object shapes follow the declared preference (default: interface over type)"
case "$CONV_TYPES" in
  *"type over interface"*) is_off "project prefers type over interface" ;;
  *) ts_files | xargs grep -nE '^(export )?type [A-Z][A-Za-z]* = \{' 2>/dev/null | report ;;
esac

# ---------------------------------------------------------------------------
section "14. No 'export * from' in barrels"
ts_files | xargs grep -n '^export \* from' 2>/dev/null | report

# ---------------------------------------------------------------------------
section "15. One component per file (2+ top-level 'function Capital(' in one .tsx)"
{
  tsx_files | while read -r file; do
    n="$(grep -cE '^(export )?(default )?function [A-Z][A-Za-z]*\(' "$file" || true)"
    if [ "${n:-0}" -gt 1 ]; then echo "$file ($n components)"; fi
  done
} | report

# ---------------------------------------------------------------------------
section "16. Vague names in callbacks: (p|f|t|m|d|e|res|tmp|val|obj|arr|fn|cb) =>"
ts_files | xargs grep -nE '\.(map|filter|forEach|find|some|every|reduce)\(\(?([a-df-hj-z]|res|tmp|val|obj|arr|fn|cb)\)? =>' 2>/dev/null | report

# ---------------------------------------------------------------------------
section "17. Vague names elsewhere: const res =, (e) =>, (e: ..."
ts_files | xargs grep -nE 'const (res|tmp|val|obj|arr|fn|cb) =|\((e|res)\) =>|\((e|res): ' 2>/dev/null | report

# ---------------------------------------------------------------------------
section "18. Boolean state without is/has/should/can prefix"
ts_files | xargs grep -nE 'const \[([a-z][A-Za-z]*), set[A-Z][A-Za-z]*\] = useState(<boolean>)?\((true|false)\)' 2>/dev/null \
  | grep -vE '\[(is|has|should|can|did|was)[A-Z]' | report

# ---------------------------------------------------------------------------
section "19. Constant arrays declared inside feature component files (move to constants/)"
if [ -d "$SRC/features" ]; then
  find "$SRC/features" -path '*/components/*.tsx' -exec grep -nEH '^const [A-Z_]{3,}(: [A-Za-z\[\]<>]+)? = \[' {} + 2>/dev/null | report
else
  echo "  (no $SRC/features folder)"
fi

# ---------------------------------------------------------------------------
section "20. Helper functions declared inside feature component files (move to utils/)"
if [ -d "$SRC/features" ]; then
  find "$SRC/features" -path '*/components/*.tsx' -exec grep -nEH '^function [a-z][A-Za-z]*\(' {} + 2>/dev/null | report
else
  echo "  (no $SRC/features folder)"
fi

# ---------------------------------------------------------------------------
section "21. Missing index.ts barrel in components/hooks/utils folders with 3+ files"
if [ -d "$SRC/features" ]; then
  {
    find "$SRC/features" -type d \( -name components -o -name hooks -o -name utils \) | while read -r dir; do
      n="$(find "$dir" -maxdepth 1 -type f \( -name '*.ts' -o -name '*.tsx' \) ! -name 'index.ts' | wc -l | tr -d ' ')"
      if [ "$n" -ge 3 ] && [ ! -f "$dir/index.ts" ]; then echo "$dir ($n files)"; fi
    done
  } | report
else
  echo "  (no $SRC/features folder)"
fi

# ---------------------------------------------------------------------------
section "22. Duplicate util filenames across features (candidates to lift to shared)"
if [ -d "$SRC/features" ]; then
  find "$SRC/features" -path '*/utils/*.ts' ! -name index.ts -exec basename {} \; | sort | uniq -d | report
else
  echo "  (no $SRC/features folder)"
fi

# ---------------------------------------------------------------------------
section "23. eslint-disable without an explanation comment on the line above"
{
  ts_files | while read -r file; do
    awk -v f="$file" '
      /eslint-disable/ {
        if (prev !~ /^[[:space:]]*(\/\/|\/\*|\*)/) print f ":" NR ": " $0
      }
      { prev = $0 }
    ' "$file"
  done
} | report

# ---------------------------------------------------------------------------
section "24. Component files over 300 lines (consider splitting)"
tsx_files | xargs wc -l 2>/dev/null | awk '$1 > 300 && $2 != "total" {print $2 " (" $1 " lines)"}' | report

# ---------------------------------------------------------------------------
section "25. Blank line before return (heuristic)"
{
  ts_files | while read -r file; do
    awk -v f="$file" '
      {
        cur = $0
        if (cur ~ /^[[:space:]]+return([ ;(]|$)/ && NR > 1) {
          if (prev !~ /^[[:space:]]*$/ &&
              prev !~ /[{(\[,][[:space:]]*$/ &&
              prev !~ /^[[:space:]]*(\/\/|\/\*|\*)/ &&
              prev !~ /=>[[:space:]]*$/ &&
              !(prev ~ /^[[:space:]]*(if|else|for|while|switch|case|default|try|catch|finally)\>/ && prev !~ /;[[:space:]]*$/)) {
            print f ":" NR
          }
        }
        prev = cur
      }
    ' "$file"
  done
} | report

# ---------------------------------------------------------------------------
# Sections 26-28 close blind spots that let real breaches through a clean run.
# Each one exists because something got past 18/19 and had to be found by hand.
section "26. Any constant declared in a component file (not just arrays — move to constants/)"
{
  # 19 only matches SCREAMING_CASE assigned an array literal, in features/*/components.
  # `const sizeClasses: Record<Size, string> = { ... }` is none of those things, and
  # neither is a shared component under src/components. This catches object, array,
  # number and string literals under any component folder.
  tsx_files | xargs grep -nE '^const [A-Za-z_][A-Za-z0-9_]*[[:space:]]*(:[^=]+)?=[[:space:]]*(\{|\[|[0-9]|"|'"'"')' 2>/dev/null | report
}

# ---------------------------------------------------------------------------
section "27. Types other than <Name>Props declared in a component file (move to types/)"
{
  # "Types used by constants, or shared within a feature, live in the feature's
  # types/" — nothing checked that, so a `type AvatarSize` keyed the size map from
  # inside the component file it was supposed to have left.
  tsx_files | xargs grep -nE '^(export )?(type|interface) [A-Z][A-Za-z0-9]*' 2>/dev/null \
    | grep -vE '(type|interface) [A-Z][A-Za-z0-9]*Props\b' | report
}

# ---------------------------------------------------------------------------
section "28. Boolean const without is/has/should/can prefix"
{
  # 18 only looks at useState. A plain `const startsRun = a !== b` is the same
  # rule and was invisible.
  #
  # Two exclusions, both because the comparison belongs to something other than
  # the constant being named: `=>` means it is inside a callback, so the const is
  # a filtered array; ` ? ` means it is a ternary test, so the const is whichever
  # branch won — usually a string.
  ts_files | xargs grep -nE '^[[:space:]]*const [a-z][A-Za-z0-9]* = [^;]*(===|!==|\.includes\(|\.some\(|\.has\(|> [0-9]|< [0-9])' 2>/dev/null \
    | grep -v '=>' \
    | grep -v ' ? ' \
    | grep -vE 'const (is|has|should|can|did|was)[A-Z]' | report
}

# ---------------------------------------------------------------------------
section "29. Tailwind's default palette instead of the design tokens"
{
  # Phase 16 replaced slate/blue/red/green with a declared palette in
  # `styles/globals.css`. Nothing enforced it, and nothing could: a stray
  # `bg-slate-100` typechecks, lints, renders, and is simply the wrong colour on
  # a page that has no other grey on it. Every colour a component names must
  # come from @theme, so a numbered Tailwind swatch is always a mistake here.
  #
  # `bg-white` and `text-black` are in the list for the same reason: the paper
  # is ivory, and pure white beside it reads as a rendering bug.
  ts_files | xargs grep -nE '(bg|text|border|ring|from|to|via|fill|stroke|accent|decoration|outline|shadow|divide|placeholder)-(slate|gray|zinc|neutral|stone|red|orange|amber|yellow|lime|green|emerald|teal|cyan|sky|blue|indigo|violet|purple|fuchsia|pink|rose)-[0-9]|(bg|text|border)-(white|black)([^a-z-]|$)' 2>/dev/null | report
}

# ---------------------------------------------------------------------------
printf '\n\033[1m== Summary\033[0m\n'
TOTAL="$(cat "$TOTAL_FILE")"
printf '  %s total hit(s) across all sections. Fix the top sections first: 3-7 are the ones that cause real bugs.\n' "$TOTAL"

# Still a report by default — a heuristic that blocks work teaches people to
# skip it. `--gate` is for `npm run verify`, where the repo is known clean and
# any hit is therefore new: a regression, not a pre-existing judgement call.
if [ "$GATE" -eq 1 ] && [ "$TOTAL" -gt 0 ]; then
  printf '  \033[31mFailing: run without --gate to read the sections above.\033[0m\n'
  exit 1
fi
