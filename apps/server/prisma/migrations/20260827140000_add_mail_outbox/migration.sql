-- A transactional outbox for email. The row is written in the same transaction
-- as whatever promised the mail, so the promise and its cause commit together.
CREATE TYPE "OutboxStatus" AS ENUM ('PENDING', 'SENT', 'FAILED');

CREATE TABLE "OutboxMessage" (
	"id"            TEXT NOT NULL,
	"status"        "OutboxStatus" NOT NULL DEFAULT 'PENDING',
	"to"            TEXT NOT NULL,
	"subject"       TEXT NOT NULL,
	"body"          TEXT NOT NULL,
	"attempts"      INTEGER NOT NULL DEFAULT 0,
	"nextAttemptAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
	"lastError"     TEXT,
	"sentAt"        TIMESTAMP(3),
	"createdAt"     TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

	CONSTRAINT "OutboxMessage_pkey" PRIMARY KEY ("id")
);

-- The worker's only query is "due PENDING rows, oldest first". This index serves
-- the filter and the ordering together, which is what keeps the claim cheap as
-- the SENT rows accumulate in front of it.
CREATE INDEX "OutboxMessage_status_nextAttemptAt_idx"
ON "OutboxMessage" ("status", "nextAttemptAt");

-- A body exists only while there is still something to send. A password reset
-- body contains a working link to somebody's account, and a terminal row keeping
-- it would leave that link readable for as long as the row is retained — long
-- after the mail went out or was given up on.
--
-- Same argument, and the same mechanism, as "Message_deleted_has_no_content":
-- the worker empties the column, and this makes that a property of the data
-- rather than something one code path remembers to do.
ALTER TABLE "OutboxMessage" ADD CONSTRAINT "OutboxMessage_terminal_has_no_body"
CHECK ("status" = 'PENDING' OR "body" = '');

-- A row is sent exactly when it says it was. Without this, "status = 'SENT' but
-- sentAt IS NULL" is representable, and every query that reports on delivery has
-- to decide which of the two columns it believes.
ALTER TABLE "OutboxMessage" ADD CONSTRAINT "OutboxMessage_sent_has_a_timestamp"
CHECK (("status" = 'SENT') = ("sentAt" IS NOT NULL));
