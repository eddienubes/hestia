export interface NormalizedListingSummary {
  id: string;
  listingUrl: string;
  name: string;
  propertyType: string;
  roomType: "entire_home" | "private_room" | "shared_room" | "hotel_room";
  locationLabel: string;
  price: { amount: number; currency: string; period: "night" | "total" };
  rating: { value: number | null; reviewCount: number };
  thumbnailUrl?: string;
  guests: number;
  bedrooms?: number;
  beds?: number;
  baths?: number;
  isSuperhost?: boolean;
}

export interface NormalizedSearchResult {
  listings: NormalizedListingSummary[];
  nextCursor?: string;
}

export interface NormalizedListingDetails {
  id: string;
  listingUrl: string;
  name: string;
  description: string;
  propertyType: string;
  roomType: "entire_home" | "private_room" | "shared_room" | "hotel_room";
  host: { name: string; isSuperhost: boolean; yearsHosting?: number };
  locationLabel: string;
  guests: number;
  bedrooms?: number;
  beds?: number;
  baths?: number;
  amenities: string[];
  houseRules: string[];
  price?: { amount: number; currency: string; period: "night" | "total"; totalForStay?: number };
  rating: { value: number | null; reviewCount: number; categoryRatings?: Record<string, number> };
  images: string[];
  availability?: { checkin: string; checkout: string; isAvailable: boolean };
}

export interface NormalizedSearchParams {
  location: string;
  placeId?: string;
  adults: number;
  children: number;
  infants: number;
  pets: number;
  minPrice?: number;
  maxPrice?: number;
  currency: string;
  propertyType?: "entire_home" | "private_room" | "shared_room" | "hotel_room";
  // Generic human-readable amenity names only — resolving these to provider-specific
  // vocabulary/IDs lives entirely inside the Airbnb adapter (src/airbnb/), keeping this
  // interface provider-agnostic in case a second provider is ever added.
  amenities?: string[];
  limit: number;
  cursor?: string;
  dateMode: "exact" | "flexible";
  checkin?: string;
  checkout?: string;
  flexibleTripLength?: "weekend" | "week" | "month";
  flexibleMonths?: string[];
}

export interface NormalizedListingDetailsParams {
  listingId: string;
  checkin?: string;
  checkout?: string;
  adults: number;
  children: number;
  infants: number;
  pets: number;
  currency: string;
}

export interface AccommodationSearchProvider {
  search(params: NormalizedSearchParams): Promise<NormalizedSearchResult>;
  getListingDetails(params: NormalizedListingDetailsParams): Promise<NormalizedListingDetails>;
}
