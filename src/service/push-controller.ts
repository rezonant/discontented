import { Controller, Post, Patch, Body, Response } from "@alterior/web-server";
import * as bodyParser from 'body-parser';
import { Context, CfEntry, CfEntryDefinition, CfLink } from "../common";

export interface PushUpdate {
    tableName : string;
    rowData : any;
}

@Controller()
export class PushController {
    constructor(
        private context : Context
    ) {

    }

    private async putEntry(id : string, entry : CfEntryDefinition) {
        console.log(`PUTTING ENTRY ${id} to:`);
        console.log(JSON.stringify(entry, undefined, 2));
    }

    private async getEntry(id : string): Promise<CfEntry> {
        return null; // todo
    }

    @Patch('', {
        middleware: [
            bodyParser.json()
        ]
    })
    async patch(@Body() repr : PushUpdate) {
        let schema = this.context.schema;
        let typeId = this.context.getTypeIdForTableName(repr.tableName);
        let type = schema.contentTypes.find(x => x.sys.id === typeId);
        let cfid = repr.rowData['cfid'];
        let fields : any = {};
        let existingEntry = await this.getEntry(cfid);
        let tableName = this.context.getTableNameForType(type);

        for (let field of type.fields) {
            let columnName = this.context.getColumnNameForField(field);
            let value = repr.rowData[columnName];
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
                    // Linking table
                    let linkingTableName = `${tableName}_${columnName}`;
                } else {
                    if (linkType === 'Entry') {
                        columnName += '_cfid';
                        fields[field.id] = <CfLink>{
                            sys: {
                                type: 'Link',
                                linkType: 'Entry',
                                id: value,
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
                    "en-US": value
                }
            }
        }
        
        try {
            await this.putEntry(cfid, { fields });
        } catch (e) {
            console.error(`Caught error while putting entry to Contentful: ${e}`);
            return Response.serverError();
        }

        return {
            status: 'success'
        }
    }
}