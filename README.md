# Drive Gallery

A static Google Drive photo viewer built with plain HTML, CSS, and JavaScript. It is designed for public Google Drive folders and works well on GitHub Pages.

## What it does

- accepts a short key like `key123`
- accepts a raw Google Drive folder ID
- accepts a full Google Drive folder link
- loads all public image files in that folder
- shows them in a responsive gallery with a fullscreen lightbox

## Files

- `index.html`: page structure
- `styles.css`: gallery styling
- `app.js`: folder lookup, Drive API calls, and lightbox logic
- `config.js`: public site settings and your Google API key
- `data/folders.json`: public key-to-folder mapping

## 1. Get the Google Drive folder ID

If your Google Drive folder URL is:

```text
https://drive.google.com/drive/folders/1AbCdEfGhIjKlMnOpQrStUvWxYz123456
```

then the folder ID is:

```text
1AbCdEfGhIjKlMnOpQrStUvWxYz123456
```

## 2. Make the folder public

For each folder you want to show:

1. Open the folder in Google Drive.
2. Click `Share`.
3. Change access to `Anyone with the link`.
4. Keep viewer access unless you intentionally want editors.

This project is built for public folders. If the folder is private, the static site will not be able to read it without adding Google sign-in and OAuth.

## 3. Create a Google API key

1. Open [Google Cloud Console](https://console.cloud.google.com/).
2. Create a project or select an existing one.
3. Enable the `Google Drive API`.
4. Go to `APIs & Services` -> `Credentials`.
5. Create an `API key`.
6. Restrict the key:
   - application restriction: `HTTP referrers (web sites)`
   - allowed referrers:
     - `http://localhost:*/*`
     - `http://127.0.0.1:*/*`
     - `https://YOUR_GITHUB_USERNAME.github.io/*`
     - if you use a project repo path on GitHub Pages, also add `https://YOUR_GITHUB_USERNAME.github.io/YOUR_REPO_NAME/*`
7. Under API restrictions, limit it to `Google Drive API`.

## 4. Add your API key

Edit `config.js`:

```js
window.APP_CONFIG = {
  pageTitle: "Drive Gallery",
  heroText: "Enter a gallery key, a Google Drive folder ID, or a full folder link to open a public photo collection.",
  googleApiKey: "PASTE_YOUR_API_KEY_HERE",
  orderBy: "createdTime desc"
};
```

## 5. Add your key mappings

Edit `data/folders.json`:

```json
{
  "wedding": {
    "folderId": "1AbCdEfGhIjKlMnOpQrStUvWxYz123456",
    "label": "Wedding Album"
  },
  "summer-2026": {
    "folderId": "1ZyXwVuTsRqPoNmLkJiHgFeDcBa654321",
    "label": "Summer 2026"
  }
}
```

## 6. Run locally

Because the app loads JSON with `fetch`, serve it through a local web server instead of opening `index.html` directly.

If you have Python installed:

```bash
python -m http.server 8080
```

Then open:

```text
http://localhost:8080
```

## 7. Publish to GitHub Pages

### Option A: publish from the repository root

1. Create a new GitHub repository.
2. Upload these files to the repo root.
3. Push to GitHub.
4. In GitHub, open `Settings` -> `Pages`.
5. Set:
   - source: `Deploy from a branch`
   - branch: `main`
   - folder: `/ (root)`
6. Save and wait for GitHub Pages to publish.

Your site URL will usually be:

```text
https://YOUR_GITHUB_USERNAME.github.io/YOUR_REPO_NAME/
```

### Option B: user site

If the repo name is exactly `YOUR_GITHUB_USERNAME.github.io`, the site is usually published at:

```text
https://YOUR_GITHUB_USERNAME.github.io/
```

## Notes

- `config.js` and `data/folders.json` are public in a static site, so only use this approach with folders that are intentionally public.
- The API key is also public to the browser, so always restrict it by referrer and API.
- Large folders may take longer to load because the app fetches image metadata directly from Google Drive.
