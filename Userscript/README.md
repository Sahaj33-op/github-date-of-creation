Stop guessing whether a GitHub repository is a battle-tested titan or a project abandoned years ago.

**GitHub Date of Creation** seamlessly adds repository creation dates, repository size, maintenance status, and maturity badges directly into the GitHub UI. Originally a popular Chrome extension, this tool has been completely rewritten from scratch as a lightning-fast, zero-dependency userscript.

> 📥 **Install from Greasy Fork:** [github-date-of-creation](https://greasyfork.org/en/scripts/572909-github-date-of-creation)

### 🔥 Features

* **Maturity Badges (The Lindy Effect):** Quickly assess project age with visual indicators next to the date.
  * 🌱 **Sprout** (< 1 year)
  * 🌿 **Established** (> 1 year)
  * 🌳 **Mature** (> 5 years)
  * 🏛️ **Ancient** (> 10 years)
* **Repository Size:** Instantly see the disk size of any repository (e.g. `1.5 MB`) right in the sidebar badge.
* **Omnipresent Insights:** Dates are not only on the repo page. They are added asynchronously into **Search Results** and **Trending** pages, saving you countless clicks.
* **Maintenance Status:** View exactly when the repository was last pushed with health classification (Active/Stable/Dormant/Legacy). Identify inactive projects instantly.
* **Per-Repo Refresh:** Click the `↻` button on any badge to force a fresh API fetch and update the cache.
* **Blazing Fast:** No `moment.js`, no jQuery, and no bloat. Uses native `Intl` APIs, a debounced DOM mutation observer to keep your browser smooth, and parallel fetching to avoid network delays.

### ⚙ How to Access Settings (Important!)

This script has a built-in, dark-themed settings modal. To access it:
1. Open any page on GitHub.
2. Click your **Tampermonkey / Violentmonkey** extension icon in your browser toolbar.
3. Click **"⚙ Settings"** under the script name.

From here, you can:
- Toggle relative/absolute time display
- Show or hide repository size
- Show or hide last push (maintenance) status
- Customize the exact date format
- Add a **Personal Access Token**
- **Clear all cached data** to force fresh fetches on next visit

### ⚠ Beating the GitHub API Rate Limit

By default, GitHub limits unauthenticated API requests to **60 per hour**. If you browse many search results, you'll reach this limit quickly, and the dates will stop displaying.

**The Fix:**
1. Generate a free [GitHub Personal Access Token (PAT)](https://github.com/settings/tokens/new) (You do **not** need to select any scope boxes; a blank token works perfectly).
2. Open the script Settings (via the Tampermonkey menu).
3. Paste your token and click Save. Your limit is now 5,000 requests per hour.

### 🧹 Cache Management

The script caches repository data for **30 days** to minimize API calls. If you want to refresh data sooner:
- Use the **↻** button on any individual badge to refresh that repo
- Use the **"Clear All Cache"** button in Settings to reset everything

---

*Built with logic and performance in mind by Sahaj. Forked and modernized from the original extension by Varayut L.*