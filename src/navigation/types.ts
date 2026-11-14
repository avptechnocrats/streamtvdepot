export type AuthStackParamList = {
  Login: undefined;
  Signup: undefined;
  ForgotPassword: undefined;
  ResetPassword: undefined;
};

export type MainTabParamList = {
  Home: undefined;
  Watchlist: undefined;
  Downloads: undefined;
  Search: undefined;
  Account: undefined;
};

export type RootStackParamList = {
  Auth: undefined;
  Main: undefined;
  SeriesDetails: { seriesId: string };
  LiveTv: undefined;
  LiveTvChannel: { channelId: string };
  CategoryDetails: { categoryName: string; categoryId?: string; categorySlug?: string };
  ContentDetails: { contentId: string };
  Pricing: { purchaseType?: "subscription" | "rent" | "ppv"; contentId?: string } | undefined;
  Checkout: { planId: string; contentId?: string; purchaseType?: "rent" | "ppv" };
  Watchlist: undefined;
  Downloads: undefined;
  Transactions: undefined;
  Subscriptions: undefined;
  Security: undefined;
  Help: undefined;
  PpvEvents: undefined;
  PpvEventDetails: { eventId: string };
  Rentals: undefined;
};
