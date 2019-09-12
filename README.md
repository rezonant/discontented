# discontented

We are not content with the capabilities of Contentful so we strive to disconnect our content from the clutches of Discontent.

`discontented` helps you migrate your content store from Contentful to PostgreSQL.

# Warning: Early Development

This tool is not yet built as designed. The structure and paradigm of the tool is going to change.

# Design

Design is based on the premise that a successful migration away from Contentful should be a phased migration, allowing minimal disruption to existing publishing processes while gaining maximal developer ergonomics and queryability by using SQL. 

Our envisioned path away from Contentful is as follows (your team may wish to do it differently):

1. Batch import your existing schema and data into SQL 
2. Freeze non-trivial changes to your Contentful model (adding new fields is OK)
3. Continually update the SQL copy of the data using Contentful's webhooks feature while publishers continue to edit using Contentful.
4. Rewrite your most complex and performance-intensive queries using the SQL models
5. Build proper forms over data editors that target a model layer featuring abstracted delivery (ie ability to write to both
or either Contentful and SQL). Deploy them configured to target Contentful's APIs at first
6. Move all usages to SQL
7. Move publishers over to the new editing solution, account for any missed use cases and ergonomics improvements
8. Freeze all changes via Contentful
9. Migrate your file assets from Contentful by migrating `_cfurl` fields to be hosted elsewhere
10. Rewire associations to be based on `id` or some other ID on the newly canonical SQL store
11. Replace `cfid` references on linking tables with `id` or some other linking identifier
12. Reap the rewards of not being limited by Contentful!

In order to maximize the usefulness of `discontented` for all software teams out there still using Contentful, we have built the tool to be independent from your overall software stack. The tool manages the schema of Contentful mirror tables for you, and provides a microservice that can handle both periodic batch and on-demand syncing (webhooks) from Contentful on an ongoing basis.

When a Contentful resource gets updated, you can tell `discontented` to contact your web service in order to run business-rule-specific lifecycle hooks. When you want to update a resource at Contentful and keep the resource in sync on both sides, you can use a (much simpler than Contentful!) REST API to perform the update in both places without having to reimplement the extensive translation logic that `discontented` already has.

# Testing

To try this, first make sure to set up a `spaceId` and `managementToken` in `src/credentials.ts`.

Open `main.ts` and look at `main()`. There are various high-level script-like methods here that let you export a copy of your Contentful schema and data. Schema and content will be stored in `data/contentful-schema.json` and `data/demo-content.json` respectively.

Once you have data stored locally, use `generateSchema()` to create a DDL definition for your PostgreSQL database. Find it generated at `data/schema.sql`.

Create a SQL batch IMPORT script using `generateBatchUpdate()`. It will land at `data/batch-update.sql`.

