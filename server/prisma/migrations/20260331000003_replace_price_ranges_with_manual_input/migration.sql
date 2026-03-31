-- Replace PriceRange many-to-many with manual priceFrom/priceTo on UserService

DROP TABLE IF EXISTS "_PriceRangeToUserService";

ALTER TABLE "UserService" ADD COLUMN "priceFrom" INTEGER;
ALTER TABLE "UserService" ADD COLUMN "priceTo" INTEGER;
