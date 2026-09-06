import type {
	ExpressiveCodeConfig,
	LicenseConfig,
	NavBarConfig,
	ProfileConfig,
	SiteConfig,
} from "./types/config";
import settings from "./site-settings.json";

export const siteConfig: SiteConfig = {
	title: settings.title,
	subtitle: settings.subtitle,
	lang: "zh_CN", // Language code, e.g. 'en', 'zh_CN', 'ja', etc.
	themeColor: {
		hue: settings.hue,
		fixed: false, // Hide the theme color picker for visitors
	},
	banner: {
		enable: settings.bannerEnabled,
		src: settings.banner,
		position: "center", // Equivalent to object-position, only supports 'top', 'center', 'bottom'. 'center' by default
		credit: {
			enable: Boolean(settings.creditText),
			text: settings.creditText,
			url: settings.creditUrl,
		},
	},
	toc: {
		enable: settings.tocEnabled,
		depth: 2, // Maximum heading depth to show in the table, from 1 to 3
	},
	favicon: [
		// Leave this array empty to use the default favicon
		// {
		//   src: '/favicon/icon.png',    // Path of the favicon, relative to the /public directory
		//   theme: 'light',              // (Optional) Either 'light' or 'dark', set only if you have different favicons for light and dark mode
		//   sizes: '32x32',              // (Optional) Size of the favicon, set only if you have favicons of different sizes
		// }
	],
};

export const navBarConfig: NavBarConfig = {
	links: settings.navigation,
};

export const profileConfig: ProfileConfig = {
	avatar: settings.avatar,
	name: settings.name,
	bio: settings.bio,
	links: settings.links,
};

export const licenseConfig: LicenseConfig = {
	enable: true,
	name: "CC BY-NC-SA 4.0",
	url: "https://creativecommons.org/licenses/by-nc-sa/4.0/",
};

export const expressiveCodeConfig: ExpressiveCodeConfig = {
	// Note: Some styles (such as background color) are being overridden, see the astro.config.mjs file.
	// Please select a dark theme, as this blog theme currently only supports dark background color
	theme: "github-dark",
};
