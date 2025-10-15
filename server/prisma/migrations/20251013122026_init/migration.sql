-- CreateTable
CREATE TABLE "EventPersist" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "idempotencyKey" TEXT NOT NULL,
    "bookingId" TEXT NOT NULL,
    "propertyId" TEXT NOT NULL,
    "eventType" TEXT NOT NULL,
    "actor" TEXT NOT NULL,
    "occurredAt" DATETIME NOT NULL,
    "metadataJson" TEXT NOT NULL,
    "mediaCid" TEXT,
    "txHash" TEXT NOT NULL,
    "nid" TEXT NOT NULL,
    "chain" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- CreateIndex
CREATE UNIQUE INDEX "EventPersist_idempotencyKey_key" ON "EventPersist"("idempotencyKey");

-- CreateIndex
CREATE INDEX "EventPersist_bookingId_idx" ON "EventPersist"("bookingId");

-- CreateIndex
CREATE INDEX "EventPersist_nid_idx" ON "EventPersist"("nid");
