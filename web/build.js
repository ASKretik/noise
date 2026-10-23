// web/build.js -- the build stamp.
//
// GENERATED. `npm run stamp` bumps it, and that script also rewrites the ?v= on every
// page's stylesheet link so the two can never disagree.
//
// It namespaces the IndexedDB database, which means **every published update starts every
// save file fresh**. That is a deliberate choice for a project still changing shape: the
// schema, the tiers, the economy and the scoring have all moved between deploys, and a
// profile carried across one of those changes is a record of rules that no longer exist.
// Cheaper and more honest to start clean than to migrate a save into a different game.
//
// BUILD-BEGIN
export const BUILD = 2;
// BUILD-END
