export class AirbnbApiError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "AirbnbApiError";
  }
}

export class AirbnbTimeoutError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "AirbnbTimeoutError";
  }
}

export class AirbnbListingNotFoundError extends Error {
  readonly listingId: string;

  constructor(listingId: string) {
    super(`Listing "${listingId}" not found.`);
    this.name = "AirbnbListingNotFoundError";
    this.listingId = listingId;
  }
}
