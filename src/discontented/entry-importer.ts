import { Context, CfStore, CfEntry, CfLocalizedValue, CfLink } from "./common";
import { ContentfulLocator } from "./asset-locator";
import { RowUpdate } from "./row-update";

export class EntryImporter {
    constructor(
        readonly context : Context,
        readonly schema : CfStore,
        readonly assetLocator : ContentfulLocator
    ) {
    }

    data : Map<string, RowUpdate[]>;

    addRow(tableName : string, row : RowUpdate) {
        let rows : RowUpdate[];
        if (!this.data.has(tableName)) {
            rows = [];
            this.data.set(tableName, rows);
        } else {
            rows = this.data.get(tableName);
        }

        rows.push(row);
    }

    async generateData(entry : CfEntry, latestEntry : CfEntry) {

        let published = true;

        if (!entry) {
            published = false;
            entry = latestEntry;
        }

        this.data = new Map<string, RowUpdate[]>();

        // generate sql-data

        let rowData = new Map<string, any>();

        rowData.set('environment_cfid', entry.sys.environment ? entry.sys.environment.sys.id : null);
        rowData.set('cfid', entry.sys.id);
        
        let contentType = this.schema.contentTypes.find(x => x.sys.id === entry.sys.contentType.sys.id);

        for (let fieldDefinition of contentType.fields) {
            let fieldId = fieldDefinition.id;
            let field = entry.fields[fieldId];

            let isArray = false;
            let fieldType = fieldDefinition.type;
            let linkType = fieldDefinition.linkType;
            
            if (fieldDefinition.type === 'Array') {
                isArray = true;
                fieldType = fieldDefinition.items.type;
                linkType = fieldDefinition.items.linkType;
            }

            let columnName = this.context.getColumnNameForFieldId(fieldId);

            if (field && field[this.context.defaultLocalization] !== undefined) {
                let localizedField = <CfLocalizedValue>field;
                field = localizedField[this.context.defaultLocalization];
            }

            if (fieldType === 'Link') {
                if (linkType === 'Asset') {
                    if (isArray) {
                        throw new Error(`Array link of Assets is not yet supported!`);
                    } else {
                        let link = <CfLink>field;

                        columnName = `${columnName}_cfurl`;
                        rowData.set(columnName, null);

                        if (link && !link.sys) {
                            console.log(JSON.stringify(link));
                            console.log(JSON.stringify(fieldDefinition));

                            throw new Error('bad');
                            
                        }

                        if (link) {
                            let asset = await this.assetLocator.retrieveAsset(this.context.spaceId, link.sys.id);

                            if (asset && asset.fields.file) {
                                if (!asset.fields.file[this.context.defaultLocalization].url) {
                                    console.error(`Entry ${entry.sys.id} [${entry.sys.contentType.sys.id}]: ${fieldId}: Could not get URL from asset ${link.sys.id}:`);
                                    console.log(JSON.stringify(asset, undefined, 2));
                                }

                                let url = `https:${asset.fields.file[this.context.defaultLocalization].url}`;

                                rowData.set(columnName, url);
                            } else {
                                if (!asset)
                                    rowData.set(columnName, `cf-asset-missing:${link.sys.id}`);
                                else if (!asset.fields.file)
                                    rowData.set(columnName, `cf-asset-file-missing:${link.sys.id}`);
                            }
                        }
                    }
                } else {

                    if (isArray) {
                        let array = <CfLink[]>field;

                        if (array) {
                            let order = 0;
                            for (let link of array) {
                                let linkRowData = new Map<string, any>();
                                linkRowData.set('owner_cfid', entry.sys.id);
                                linkRowData.set('item_cfid', link.sys.id);
                                linkRowData.set('order', order++);

                                this.addRow(
                                    `${this.context.getTableNameForEntry(entry)}_${this.context.transformIdentifier(fieldDefinition.id)}`, 
                                    { 
                                        onConflict: 'update', 
                                        uniqueKey: ['owner_cfid', 'item_cfid'],
                                        data: linkRowData 
                                    }
                                );
                            }
                        }
                    } else {
                        let link = <CfLink>field;

                        columnName = `${columnName}_cfid`;
                        rowData.set(columnName, null);

                        if (link && !link.sys) {
                            console.log(JSON.stringify(link));
                            console.log(JSON.stringify(fieldDefinition));

                            throw new Error('bad');
                            
                        }

                        if (link) 
                            rowData.set(columnName, link.sys.id);
                    }
                }
            } else {
                let rawValue : any = field;

                if (field && field[this.context.defaultLocalization] !== undefined) {
                    let localizedField = <CfLocalizedValue>field;
                    rawValue = localizedField[this.context.defaultLocalization];
                }

                rowData.set(columnName, rawValue);
            }
        }

        rowData.set('created_at', entry.sys.createdAt);
        rowData.set('updated_at', entry.sys.updatedAt);
        rowData.set('published_at', entry.sys.publishedAt);
        rowData.set('first_published_at', entry.sys.firstPublishedAt);
        rowData.set('is_published', published);
        rowData.set('is_archived', false);
        rowData.set('is_deleted', false);
        rowData.set('published_version', entry.sys.publishedVersion);
        rowData.set('raw', entry);

        this.addRow(this.context.getTableNameForEntry(entry), {
            onConflict: 'update',
            uniqueKey: 'cfid',
            data: rowData
        });

    }
}
