-- ============ ROLE-BOUND INVITE LINKS ============
-- Persistent (never-expiring) invite links bound to a set of roles and a
-- participation status. Consumed at registration to create an ACCEPTED
-- UserArtist for the new user.
CREATE TABLE "ArtistInvite" (
  "id"                  TEXT NOT NULL,
  "artistId"            TEXT NOT NULL,
  "token"               TEXT NOT NULL,
  "roleIds"             TEXT[] NOT NULL DEFAULT '{}',
  "participationStatus" "MemberParticipationStatus" NOT NULL DEFAULT 'ACTIVE_MEMBER',
  "createdById"         TEXT,
  "createdAt"           TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "ArtistInvite_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "ArtistInvite_artistId_fkey" FOREIGN KEY ("artistId") REFERENCES "Artist"("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE UNIQUE INDEX "ArtistInvite_token_key" ON "ArtistInvite"("token");
CREATE INDEX "ArtistInvite_artistId_idx" ON "ArtistInvite"("artistId");
