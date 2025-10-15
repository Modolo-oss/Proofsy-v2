-- CreateTable
CREATE TABLE "MediaFile" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "originalName" TEXT NOT NULL,
    "fileName" TEXT NOT NULL,
    "filePath" TEXT NOT NULL,
    "fileSize" INTEGER NOT NULL,
    "mimeType" TEXT NOT NULL,
    "c2paSignature" TEXT,
    "captureCid" TEXT,
    "captureTxHash" TEXT,
    "captureNid" TEXT,
    "verified" BOOLEAN NOT NULL DEFAULT false,
    "uploadedBy" TEXT NOT NULL,
    "bookingId" TEXT,
    "eventId" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- CreateIndex
CREATE INDEX "MediaFile_bookingId_idx" ON "MediaFile"("bookingId");

-- CreateIndex
CREATE INDEX "MediaFile_eventId_idx" ON "MediaFile"("eventId");

-- CreateIndex
CREATE INDEX "MediaFile_captureCid_idx" ON "MediaFile"("captureCid");
