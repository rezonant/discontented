import { Injectable } from "injection-js";
import { Context, CfEntry, CfEntryDefinition, CfLink } from "../common";
import { DatabaseService } from "../database";
import { ContentfulManagementService } from "./contentful-management";

export interface PushUpdate {
    tableName : string;
    cfid : string;
    cfVersion : number;
}

@Injectable()
export class PushService {
    constructor(
        private context : Context,
        private database : DatabaseService,
        private contentfulManagement : ContentfulManagementService
    ) {
    }

    private async putEntry(id : string, entry : CfEntryDefinition) {
        console.log(`PUTTING ENTRY ${id} to:`);
        console.log(JSON.stringify(entry, undefined, 2));
    }

    private async getEntry(id : string): Promise<CfEntry> {
        return await this.contentfulManagement.getEntry(id);
    }

    private async getPublishedEntry(id : string): Promise<CfEntry> {
        return await this.contentfulManagement.getEntry(id);
    }

    public async push(updateDef : PushUpdate) {
        let schema = this.context.schema;
        let typeId = this.context.getTypeIdForTableName(updateDef.tableName);

        if (!typeId) {
            throw new Error(`Could not find a Contentful type for table ${updateDef.tableName}`);
        }

        let type = schema.contentTypes.find(x => x.sys.id === typeId);
        let cfid = updateDef.cfid;
        let fields : any = {};
        let existingEntry = await this.getEntry(cfid);
        let tableName = this.context.getTableNameForType(type);

        let rowData = await this.database.getRowByCfid(tableName, cfid);

        for (let field of type.fields) {
            let columnName = this.context.getColumnNameForField(field);
            let value = rowData[columnName];
            if (value === undefined || value === null)
                continue;
            
            let isArray = false;
            let fieldType = field.type;
            let linkType = field.linkType;

            if (field.type === 'Array') {
                isArray = true;
                fieldType = field.items.type;
                linkType = field.items.linkType;
            }

            if (fieldType === 'Link') {
                if (isArray) {
                    // Linking table, we must fetch additional rows
                    let linkingTableName = `${tableName}_${columnName}`;
                    let itemCfids = await this.database.getLinkingTableIds(linkingTableName, cfid);

                    fields[field.id] = {
                        [this.context.defaultLocalization]: 
                            itemCfids.map(itemCfid => ({
                                sys: {
                                    type: 'Link',
                                    linkType: 'Entry',
                                    id: itemCfid
                                }
                            }))
                    };

                } else {
                    if (linkType === 'Entry') {
                        columnName += '_cfid';
                        fields[field.id] = {
                            [this.context.defaultLocalization]:
                                <CfLink>{
                                sys: {
                                    type: 'Link',
                                    linkType: 'Entry',
                                    id: value,
                                }
                            }
                        };
                    } else if (linkType === 'Asset') {
                        console.error('ERROR: Cannot handle assets yet! Using existing value!');

                        if (existingEntry)
                            fields[field.id] = existingEntry.fields[field.id];
                    }
                }
            } else {
                fields[field.id] = {
                    [this.context.defaultLocalization]: value
                }
            }
        }
        
        try {
            await this.putEntry(cfid, { fields });
        } catch (e) {
            throw new Error(`Caught error while putting entry to Contentful: ${e}`);
        }
    }
}