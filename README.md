# discontented

We are not content with the capabilities of Contentful so we strive to disconnect our content from the clutches of Discontent.

`discontented` helps you migrate your content store from Contentful to PostgreSQL.

# Usage

First, create a new directory for your migration project and enter it.

Generate `package.json` for your new project:

```
npm init
```

Install `discontented`:

```
npm i discontented
```

Set up some NPM scripts within `package.json` for interacting with `discontented`:

```json
{
  // ...
  "scripts": {
    "dcf": "dcf",
    "start": "dcf serve",
    "migrate": "dcf migrate",
    "import": "dcf import",
    "export": "dcf export"
  },
  // ...
}
```

Create a configuration file named `discontented.json`:

```json
{
    "contentful": {
        "spaceId": "<space-id>",
        "managementToken": "<management-token>"
    },
    "database": {
        "host": "localhost",
        "port": 5432,
        "user": "pguser",
        "password": "pgpassword",
        "database": "mydatabase"
    },

    // optionally customize the process

    "tablePrefix": "discontented_",
    "tableMap": {
        "myContentTypeId": "my_table_name",
        "anotherContentTypeId": "another_table_name"
    }    
}
```

Once you have configured your migration project as you'd like, use:

```
npm run migrate
```

This will connect to your Contentful space, fetch it's schema and construct a migration SQL file that contains DDL commands for creating the appropriate tables to store your previously-discontentful data.

You can apply outstanding migrations using:

```
npm run apply-migrations
```

Once you have populated the tables in your database, you can perform a one-time data import using:

```
npm run import
```

This command will export your entire Contentful space and insert the data it finds into your Postgres database, so it may take some time to complete.
The `import` command is idempotent- missing rows will be created and existing rows will be updated to match the current state.

`discontented` supports automatically keeping the SQL copy of your content up to date with changes happening in Contentful. To do this, you must stand up a web-accessible server and run:

```
npm start
```

This will activate `discontented`'s web service on port 3001. 

Create a Contentful webhook filtered for the "Publish and Unpublish Entries" events which will call `discontented` at the following URL:

```
https://discontented.example.com:3001/webhooks
```

Of course, you will need to replace the hostname `discontented.example.com` with the hostname of the server you stood up to host the web service. 

`discontented` can handle migrating your SQL tables to accomodate **minor** changes to your Contentful schema. It is important that you limit the changes to your Contentful schema while `discontented` is mirroring your data, because it does not support all types of schema changes that Contentful does.

**Supported** schema changes:

- Adding new content types
- Adding new fields to existing models

**Unsupported** schema changes:

- Changing the types of fields
- Renaming fields
- Renaming content types

`discontented` uses `migrations/schema.json` to determine what content types and fields your database currently supports. Because of this, when you add a new field to Contentful without also creating a `discontented` migration, those fields will not be synchronized when using the batch import or webhook sync features.

In order to accomodate supported schema changes, simply rerun

```
npm run migrate
```

This will create a new migration file in `migrations`. 
Then use 

```
npm run apply-migrations
```

...to apply the new schema change to your Postgres database.

# Deployment

We recommend that you create a continuous integration process to handle deploying the `discontented` web service as well as managing the schema lifecycle of your Postgres databases.

A CI process should involve the following `discontented` commands:
- modify configuration stored in `discontented.json` to match the deployment environment
- deploy to destination server, running the following initialization procedure:
    - `npm install`
    - `npm apply-migrations`
    - `npm start`

The `npm run migrate` and `npm run import` steps should be run by the developer, and their results should be committed into the repository of the migration project (and not automated).

In this way, you can control the updates to your database schema on various deployment environments just as you would control the version of your application being deployed to those environments.

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