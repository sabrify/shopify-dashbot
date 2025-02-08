-- CreateTable
CREATE TABLE "UserEnv" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "sessionId" TEXT NOT NULL,
    "openaiApiKey" TEXT NOT NULL,
    "pineconeApiKey" TEXT NOT NULL,
    "pineconeApiEnv" TEXT NOT NULL,
    CONSTRAINT "UserEnv_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "Session" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateIndex
CREATE UNIQUE INDEX "UserEnv_sessionId_key" ON "UserEnv"("sessionId");
