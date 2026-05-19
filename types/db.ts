// src/types/db.ts

// ======================================================
// Shared Types
// ======================================================

export type SegmentCode = "share-awareness" | "conversion-only";

export type ReportingGroup = "marketing" | "operation";

export type PartnerStatus =
  | "pending"
  | "active"
  | "inactive"
  | "suspended"
  | "terminated";

export type LocationStatus = "active" | "inactive" | "paused" | "closed";

export type DeviceType = "mobile" | "desktop" | "tablet" | "unknown";

export type ConversionType = "purchase" | "lead" | "signup" | "add_to_cart";

export type ConversionStatus =
  | "pending"
  | "approved"
  | "rejected"
  | "cancelled"
  | "refunded";

export type CreditStatus = "pending" | "approved" | "paid" | "reversed";

export type ResourceGenerationStatus = "pending" | "completed" | "failed";

export type EmailStatus = "pending" | "sent" | "failed";

// ======================================================
// Shared Objects
// ======================================================

export interface UtmData {
  source?: string;
  medium?: string;
  campaign?: string;
  content?: string;
  term?: string;
}

export interface GeoData {
  country_code?: string;
  region?: string;
  city?: string;
}

// ======================================================
// partners
// ======================================================

export interface Partner {
  partner_id: string;

  partner_first_name: string;
  partner_last_name: string;

  organization_name?: string;

  contact_name?: string;

  contact_email: string;
  contact_phone: string;

  segment_code: SegmentCode;

  reporting_group: ReportingGroup;

  status: PartnerStatus;

  consent: "Yes" | "No";

  notes?: string;

  qr_code_asset_url?: string;
  rack_card_url?: string;

  resource_generation_status: ResourceGenerationStatus;
  email_status: EmailStatus;

  created_at: string;
  updated_at: string;
}

// ======================================================
// partner_locations
// ======================================================

export interface PartnerLocation {
  location_id: string;

  partner_id: string;

  location_name?: string;

  address_line_1?: string;
  address_line_2?: string;

  city?: string;

  state_province?: string;

  postal_code?: string;

  country_code?: string;

  status: LocationStatus;

  created_at: string;
  updated_at: string;
}

// ======================================================
// referral_links
// ======================================================

export interface ReferralLink {
  referral_link_id: string;

  partner_id: string;

  link_name?: string;

  base_path?: string;

  full_url: string;

  qr_code_asset_url?: string;
  rack_card_url?: string;

  segment_code: SegmentCode;

  utm?: UtmData;

  is_active: boolean;

  notes?: string;

  created_at: string;
  updated_at: string;
}

// ======================================================
// referral_sessions
// ======================================================

export interface ReferralSession {
  session_id: string;

  partner_id: string;

  referral_link_id: string;

  landing_url?: string;

  referrer_url?: string;

  utm?: UtmData;

  first_seen_at: string;

  last_seen_at: string;

  user_agent?: string;

  device_type: DeviceType;

  geo?: GeoData;
}

// ======================================================
// referral_conversions
// ======================================================

export interface ReferralConversion {
  conversion_id: string;

  partner_id: string;

  session_id: string;

  referral_link_id: string;

  external_order_id: string;

  conversion_type: ConversionType;

  conversion_status: ConversionStatus;

  external_customer_id?: string;

  gross_revenue?: number;

  net_revenue?: number;

  commissionable_amount?: number;

  currency_code: string;

  credit_status: CreditStatus;

  credit_amount?: number;

  conversion_timestamp: string;

  metadata?: {
    order_name?: string;

    shopify_tags?: string[];

    discount_code?: string;

    line_items?: string[];

    first_order?: boolean;
  };
}
