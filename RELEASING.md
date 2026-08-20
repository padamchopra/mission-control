# Releasing a Mac build

macOS will not open a downloaded app unless Apple has notarized it, so the
`Mac` workflow signs with a Developer ID and notarizes before publishing a
GitHub release. Without the secrets below that job fails on purpose, so an
unsigned build never ships.

It runs at 00:05 UTC nightly, and on demand from the Actions tab when a merge is
worth shipping sooner. A night with nothing new stops before the build — a
release that is the same commit as the last one is only a new number. Asking for
a run by hand always builds.

The tag is `{major}.{minor}.{run}` from `package.json` plus the workflow run
number (`v0.1.5`, `v0.1.6`, …), so each build is its own release. Do not bump
`version` in `package.json` by hand.

## One-time setup

1. Enrol in the [Apple Developer Program](https://developer.apple.com/programs/).
2. In Keychain Access, create a **Developer ID Application** certificate, export
   it as a `.p12`, then `base64 -i Remy.p12 | pbcopy`.
3. In [App Store Connect](https://appstoreconnect.apple.com/access/api) →
   Integrations → Team Keys, create a key with Developer access. Download the
   `.p8` once. Note the Key ID and the Issuer ID.
4. Add these GitHub Actions secrets on `padamchopra/remy`:

   | Secret | Value |
   |---|---|
   | `CSC_LINK` | base64 of the `.p12` |
   | `CSC_KEY_PASSWORD` | password for that `.p12` |
   | `APPLE_API_KEY` | the `.p8` itself (`gh secret set APPLE_API_KEY < AuthKey_….p8`) or a base64 of that file |
   | `APPLE_API_KEY_ID` | the Key ID |
   | `APPLE_API_ISSUER` | the Issuer UUID |
   | `APPLE_TEAM_ID` | 10-character Team ID |

5. Wait for the nightly, or run the **Mac** workflow from the Actions tab.

## Building locally

```sh
npm run pack:mac     # web + daemon + Electron DMG → desktop/release/
```

A local build has no Developer ID, so it is ad-hoc signed. After copying it into
Applications, clear quarantine once:

```sh
xattr -cr /Applications/Remy.app
```

## Updating in place

The shipped window offers Download, then Relaunch, using the zip on GitHub
Releases rather than the DMG. A daemon installed as a login item by
`deploy/setup.sh` can use the authenticated update endpoint after one manual
`git pull` and rebuild.
