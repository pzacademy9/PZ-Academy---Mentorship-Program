// Browser-side shapes of the Part B public routes. Type-only imports: nothing server-only is bundled.
import type { RegistrationConfig } from "@/lib/landing/registration/config";
import type { QuoteResult } from "@/lib/landing/registration/pricing";
import type { PromoResult } from "@/lib/landing/registration/promo";
import type { WaGroupButton } from "@/lib/landing/registration/wa-groups";
import type { PaymentAccount } from "@/lib/data/landing-payment-accounts";
import type { RegistrationStatus } from "@/lib/landing/registration/config";

/** GET /api/landing/[slug]/config */
export interface PublicConfig {
  pageId: string;
  status: "published" | "closed";
  registration: RegistrationConfig & { earlyBirdActive: boolean };
  accounts: PaymentAccount[];
  country: string | null;
}
/** GET /api/landing/me (null for guests) */
export interface MeProfile { name: string; email: string; whatsapp: string; profession: string }
/** POST /api/landing/[slug]/quote */
export interface QuoteResponse { quote: QuoteResult; promo?: PromoResult }
/** POST /api/landing/[slug]/register, 201 */
export interface RegisterSuccess { refId: string; total: number; currency: string; waGroups: WaGroupButton[]; verifyMessage: string }
/** POST /api/landing/[slug]/register, 4xx/5xx */
export interface RegisterErrorBody { error: string; field?: string }
/** GET /api/landing/[slug]/status */
export interface StatusResponse { status: RegistrationStatus; name: string; eventLabel: string }
