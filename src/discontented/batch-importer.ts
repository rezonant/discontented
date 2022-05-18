import { Context, CfStore, CfEntry } from "./common";
import { EntryImporter } from "./entry-importer";
import { RowUpdate } from "./row-update";
import { OfflineContentfulLocator } from "./offline-asset-locator";
import { ContentfulLocator } from "./asset-locator";
import { DatabaseService } from ".";

export class BatchImporter {
    constructor(
        readonly context : Context,
        readonly source : CfStore,
        readonly locator : ContentfulLocator,
        readonly database : DatabaseService
    ) {
    }

    data : Map<string, RowUpdate[]>;

    addRows(tableName, rowsToAdd : RowUpdate[]) {
        let rows : RowUpdate[];
        if (!this.data.has(tableName)) {
            rows = [];
            this.data.set(tableName, rows);
        } else {
            rows = this.data.get(tableName);
        }

        rows.push(...rowsToAdd);
    }

    private async generateForEntry(latestEntry : CfEntry) {
        let publishedEntry: CfEntry;
        
        // If the __published flag is set on this entry, it means this entry was obtained via a Publish
        // webhook event. This flag is added by the Webhook handler (webhook-controller.ts). 
        // Such an entry object is already up to date and does not require us to fetch the 
        // latest published entry. If we were to fetch the latest published entry, it may be stale compared
        // to what we already have, which would result in missed updates.

        if (latestEntry.__webhook && latestEntry.__published) {
            publishedEntry = latestEntry;
        } else {
            publishedEntry = await this.locator.retrievePublishedEntry(latestEntry.sys.space.sys.id, latestEntry.sys.id);

            if (latestEntry.__webhook && publishedEntry) {
                // This IS a webhook event, but it is not a publish event.
                // If there is a published entry from CDN, then we must skip processing this webhook
                // to avoid overlapping with publish events.
                // We still need to process this event if we are NOT in a webhook state to ensure we save 
                // the entry at all during a full sync.
                return;
            }
        }

        let entryImporter = new EntryImporter(this.context, this.source, this.locator, this.database);
        await entryImporter.generateData(publishedEntry, latestEntry);

        for (let tableName of entryImporter.data.keys()) 
            this.addRows(tableName, entryImporter.data.get(tableName));
    }

    async generateBatchSql(entries : CfEntry[] = null) {
        if (!entries)
            entries = this.source.entries;

        let sql : string[] = [];

        this.data = new Map<string, RowUpdate[]>();

        console.log(`[BatchImporter] Preparing ${entries.length} entries...`);

        let done = 0;
        let total = entries.length;
        let periodicUpdate = setInterval(() => {
            console.log(`[Preparing entries] ${Math.round(done / total * 100)}%  ${done} / ${total}`);
        }, 10*1000);

        try {
            await Promise.all(entries.map(async entry => {
                await this.generateForEntry(entry);
                done += 1;
            }));
        } finally {
            clearInterval(periodicUpdate);
        }

        done = 0;
        total = this.data.size;

        periodicUpdate = setInterval(() => {
            console.log(`[SQL generation] ${Math.round(done / total * 100)}%  ${done} / ${total}`);
        }, 10*1000);

        try {
            for (let tableName of this.data.keys()) {
                let rows = this.data.get(tableName);
                if (rows.length === 0)
                    continue;

                let pageSize = 1; // PRODUCTION: 1000
                let pagesRequired = Math.ceil(rows.length / pageSize);
                let exemplarRow = rows[0];
                let keys = Array.from(exemplarRow.data.keys());
                
                for (let page = 0; page < pagesRequired; ++page) {
                    let offset = page * pageSize;
                    let rowsSubset = rows.slice(offset, offset + pageSize);
                    let constraint = `(${exemplarRow.uniqueKey.join(', ')})`;

                    let query = 
                        `\n`
                        + `-- *********************************************\n`
                        + `-- *\n` 
                        + `-- * ${tableName} [Page ${page + 1} / ${pagesRequired}, Total: ${rows.length}] \n` 
                        + `-- *\n` 
                        + `-- **\n` 
                        + `INSERT INTO ${tableName} (${keys.map(key => `"${key}"`).join(', ')})\n`
                        + `  VALUES ${rowsSubset.map(row => `(\n`
                        + `    ${keys
                                    .map(key => row.data.get(key))
                                    .map(value => this.context.serializeValue(value))
                                    .join(`,\n    `)}\n`
                        + `  )`)}`
                        + `\n`
                        + `  ON CONFLICT ${constraint}\n`
                        + `  DO\n` 
                        + (exemplarRow.onConflict === 'update' ?
                        `    UPDATE SET\n`
                        + `    ${keys
                                    .filter(x => x !== 'cfid')
                                    .map(key => `"${key}" = EXCLUDED."${key}"`)
                                    .join(`,\n    `)}\n`
                        : `    NOTHING`
                        );
                    
                    sql.push(query);
                    done += 1
                }

            }
        } finally {
            clearInterval(periodicUpdate);
        }
        return sql;
    }
}
