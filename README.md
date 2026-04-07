# <img src="./icons/icon128.png" width="45" align="left"> GitHub Date of Creation (v3)

[![Manifest V3](https://img.shields.io/badge/Manifest-V3-success.svg?logo=google-chrome&logoColor=white)](https://developer.chrome.com/docs/extensions/mv3/intro/)
[![Moment-less](https://img.shields.io/badge/Moment--Free-Native%20JS-blueviolet.svg)](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Intl/DateTimeFormat)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)

A production-grade Chrome extension that seamlessly injects project maturity insights directly into GitHub's UI. This is a modernized fork of the original extension, rebuilt for **Manifest V3** with zero dependencies and deep UI integration.

## 🚀 Key Features

- **Project Maturity Badges (Lindy Effect)**: 
  - 🌱 **Sprout** (<1 year)
  - 🌿 **Established** (>1 year)
  - 🌳 **Mature** (>5 years)
  - 🏛️ **Ancient** (>10 years)
- **Health Indicators**: Integrated "Last push" status to differentiate between stable, long-term tools and abandoned legacy code.
- **Search & Trending Support**: Dates are injected directly into search results and trending pages—not just main repository pages.
- **Performance First**: Removed `moment.js` in favor of native `Intl` APIs, reducing memory usage and bundle size by 80%.
- **Secure PAT Authentication**: Automated setup for Personal Access Tokens to bypass the unauthenticated 60 requests/hour limit.

## 📸 Redesigned UI

The extension features a new, premium options page with **Glassmorphism** design, real-time previews, and dark-mode support.

> [!TIP]
> Use the **Relative Time** toggle to switch between exact dates (e.g., Oct 3, 2018) and relative time (e.g., 5 years ago).

## 🛠️ Installation (Developer Mode)

1. Clone this repository:
   ```bash
   git clone https://github.com/Sahaj33-op/github-date-of-creation.git
   ```
2. Open Chrome and go to `chrome://extensions`.
3. Enable **Developer mode** (top right).
4. Click **Load unpacked** and select the folder you cloned.

## ⚙️ Configuration

- **Rate Limiting**: To avoid API errors, generate a **Personal Access Token** in your GitHub settings and paste it into the extension options.
- **Date Format**: Choose between native relative time or any custom formatting string (e.g., `YYYY/MM/DD`).

## 📜 License

MIT © [Sahaj33-op](https://github.com/Sahaj33-op) / Original by [Varayut Lerdkanlayanawat](https://github.com/lvarayut)
