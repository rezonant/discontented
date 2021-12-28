import { Context, CfStore, CfEntry } from "./common";
import { EntryImporter } from "./entry-importer";
import { RowUpdate } from "./row-update";
import { OfflineContentfulLocator } from "./offline-asset-locator";
import { ContentfulLocator } from "./asset-locator";

export class BatchImporter {
    constructor(
        readonly context : Context,
        readonly source : CfStore,
        readonly locator : ContentfulLocator
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
        let publishedEntry = await this.locator.retrievePublishedEntry(latestEntry.sys.space.sys.id, latestEntry.sys.id);
        let entryImporter = new EntryImporter(this.context, this.source, this.locator);
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

        console.log(`[BatchImporter] Generating SQL...`);

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
                        + `  ON CONFLICT (${exemplarRow.uniqueKey})\n`
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
                    
                    // if (tableName === 'discontented_productions') {
                    //     console.log(query);
                    //     process.exit(1);
                    // }
                    
                }

            }
        } finally {
            clearInterval(periodicUpdate);
        }
        return sql;
    }
}
