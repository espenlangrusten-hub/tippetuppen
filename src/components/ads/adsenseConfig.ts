/** AdSense configuration, shared by client components and the ads.txt route. */
export const ADSENSE_CLIENT = process.env.NEXT_PUBLIC_ADSENSE_CLIENT || "";
export const adsEnabled = ADSENSE_CLIENT.startsWith("ca-pub-");
