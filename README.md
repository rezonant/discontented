# discontented

We are not content with the capabilities of Contentful so we strive to disconnect our content from the clutches of Discontent.

`discontented` helps you migrate your content store from Contentful to PostgreSQL.

# Warning: Early Development

This tool is not yet built as designed. The structure and paradigm of the tool is going to change.

# Design

Design is based on the premise that a successful migration away from Contentful should be a phased migration, allowing minimal disruption to existing publishing processes while gaining maximal developer ergonomics and queryability by using SQL. 

Our envisioned path away from Contentful is as follows (your team may wish to do it differently):

1. Batch import your existing schema and data into SQL and institute a freeze on non-trivial changes to your Contentful model (adding new fields is OK)
2. Continually update the SQL copy of the data using Contentful's webhooks feature while publishers continue to edit using Contentful.
3. Rewrite your most complex and performance-intensive queries using the SQL models
4. Wire your SQL models to send change notifications to `discontentful`
5. Build proper forms over data editors that target the SQL model layer
or either Contentful and SQL). Deploy them configured to target Contentful's APIs at first
6. Move all usages to SQL
7. Move publishers over to the new editing solution, account for any missed use cases and ergonomics improvements
8. Migrate your file assets from Contentful by migrating `_cfurl` fields to be hosted elsewhere
9. Rewire associations to be based on `id` or some other ID on the newly canonical SQL store
10. Replace `cfid` references on linking tables with `id` or some other linking identifier

Then, reap the rewards of not being limited by Contentful!

In order to maximize the usefulness of `discontented` for all software teams out there still using Contentful, we have built the tool to be independent from your overall software stack. The tool manages the schema of Contentful mirror tables for you, and provides a microservice that can handle both periodic batch and on-demand syncing (webhooks) from Contentful on an ongoing basis.

When a Contentful resource gets updated, you can tell `discontented` to contact your web service in order to run business-rule-specific lifecycle hooks. When you want to update a resource at Contentful and keep the resource in sync on both sides, you can use a (much simpler than Contentful!) REST API to perform the update in both places without having to reimplement the extensive translation logic that `discontented` already has.

# Testing the Scripts

To try this, first make sure to set up a `spaceId` and `managementToken` in `src/credentials.ts`.

Open `main.ts` and look at `main()`. There are various high-level script-like methods here that let you export a copy of your Contentful schema and data. Schema and content will be stored in `data/contentful-schema.json` and `data/demo-content.json` respectively.

Once you have data stored locally, use `generateSchema()` to create a DDL definition for your PostgreSQL database. Find it generated at `data/schema.sql`.

Create a SQL batch IMPORT script using `generateBatchUpdate()`. It will land at `data/batch-update.sql`.

# Programmatic Usage

See `app.module.ts` for an idea of what a project that used `discontented` as a library may look like. The project using `discontented` would be a simple Alterior application module which has configured `DcfCommonModule`. The team would maintain a very small Typescript app that depended on `discontented` to provide both an administration CLI and a deployable web service.

# Testing the Web Service

`discontented` provides a web service that provides an API to interface with.
- Accepts Contentful webhooks to keep the local database up to sync with changes in Contentful
- Accepts requests from your services to create/update the Contentful "view" of a SQL model (Push API)

## Webhooks

Accepts Contentful webhooks on `POST /webhooks`. Use `ngrok` for localhost webhook testing.

## Push API

To push an update into Contentful, send the table name and contents of a SQL table row update to `PATCH /push`.

The format is:

```json
{
    "tableName": "discontented_productions_vod_clips",
    "rowData": { "id": 2324, "cfid": "ac3DaE9cfFdeDs", "title": "My Title", "tags": ["foo", "bar"] }
}
```

The keys of `rowData` are the SQL column names in the local model. This allows you to just pass the SQL update at hand to `discontented` without needing to handle any Contentful lookup procedures within your app.