export interface DoctorCardModel {
  id: string;
  name: string;
  specialty: string;
  /** Optional monogram override (e.g. first/last initials without title prefixes). */
  initials?: string;
  imageUrl?: string;
  rating?: number;
  reviewsCount?: number;
  fee?: number;
  /** Single short availability string; omit when none. */
  availabilityLabel?: string;
  verified?: boolean;
  profileHref: string;
  bookHref: string;
}
