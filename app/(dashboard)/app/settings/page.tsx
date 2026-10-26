import { redirect } from "next/navigation";

import { CategoriesSettings } from "@/components/settings/categories-settings";
import { HouseholdSettingsForm } from "@/components/settings/household-settings-form";
import { IncomeSourcesSettings } from "@/components/settings/income-sources-settings";
import { ProfileSettingsForm } from "@/components/settings/profile-settings-form";
import { TagsSettings } from "@/components/settings/tags-settings";
import {
  canAdmin,
  canWrite,
  getHouseholdContext,
} from "@/lib/auth/household";
import { getSessionUser } from "@/lib/auth/session";
import { listAccountsWithBalances } from "@/services/account-service";
import { listCategories } from "@/services/category-service";
import { listIncomeSources } from "@/services/income-source-service";
import {
  getHouseholdSettings,
  getOwnProfile,
} from "@/services/settings-service";
import { listTags } from "@/services/tag-service";

export default async function SettingsPage() {
  const { supabase, user } = await getSessionUser();
  if (!user) redirect("/login");

  const { data: ctx } = await getHouseholdContext(supabase, user);
  if (!ctx) redirect("/login");

  const manage = canWrite(ctx.role);
  const admin = canAdmin(ctx.role);

  const [
    profileResult,
    settingsResult,
    categoriesResult,
    tagsResult,
    sourcesResult,
    accountsResult,
  ] = await Promise.all([
    getOwnProfile(supabase, ctx),
    getHouseholdSettings(supabase, ctx),
    listCategories(supabase, ctx, { includeInactive: true }),
    listTags(supabase, ctx, { includeInactive: true }),
    listIncomeSources(supabase, ctx, { includeInactive: true }),
    listAccountsWithBalances(supabase, ctx),
  ]);

  const loadError =
    profileResult.error?.message ??
    settingsResult.error?.message ??
    categoriesResult.error?.message ??
    tagsResult.error?.message ??
    sourcesResult.error?.message ??
    accountsResult.error?.message ??
    null;

  const profile = profileResult.data;
  const settings = settingsResult.data;
  const categories = categoriesResult.data ?? [];
  const tags = tagsResult.data ?? [];
  const sources = sourcesResult.data ?? [];
  const accounts = (accountsResult.data ?? [])
    .filter((account) => account.is_active)
    .map((account) => ({
      id: account.id,
      name: account.name,
      currency: account.currency,
    }));

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Settings</h1>
        <p className="text-muted-foreground">
          Profile, household preferences, and reference data for{" "}
          {ctx.householdName}.
        </p>
      </div>

      {loadError ? (
        <p className="text-sm text-destructive" role="alert">
          {loadError}
        </p>
      ) : null}

      {profile ? (
        <ProfileSettingsForm
          email={profile.email}
          firstName={profile.first_name}
          lastName={profile.last_name}
          displayName={ctx.displayName}
          currency={profile.currency}
        />
      ) : null}

      {settings ? (
        <HouseholdSettingsForm
          canEdit={admin}
          householdName={ctx.householdName}
          baseCurrency={ctx.currency}
          timezone={settings.timezone}
          weekStartsOn={settings.week_starts_on}
          monthStartsOn={settings.month_starts_on}
          defaultAccountId={settings.default_account_id}
          defaultCategoryId={settings.default_category_id}
          // undefined until the reserve migration is applied → section hidden
          reserves={settings.safe_to_spend_reserves}
          reserveCurrencies={[
            ...new Set([
              ctx.currency.toUpperCase(),
              ...accounts.map((account) => account.currency.toUpperCase()),
            ]),
          ].sort()}
          accounts={accounts}
          categories={categories
            .filter((category) => category.is_active)
            .map((category) => ({ id: category.id, name: category.name }))}
        />
      ) : (
        <p className="text-sm text-muted-foreground">
          Household settings row is missing — re-run bootstrap or create it in
          Supabase.
        </p>
      )}

      <CategoriesSettings
        categories={categories}
        canManage={manage}
        canRemove={admin}
      />

      <TagsSettings tags={tags} canManage={manage} canRemove={admin} />

      <IncomeSourcesSettings
        sources={sources}
        accounts={accounts}
        canManage={manage}
        canArchive={admin}
      />
    </div>
  );
}
