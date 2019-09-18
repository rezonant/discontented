import * as randomstring from 'randomstring';

// For reference of available webhook Topic values: 
// https://www.contentful.com/developers/docs/references/content-management-api/#/reference/webhooks

export const CF_TOPIC_ENTRY_PUBLISH = 'ContentManagement.Entry.publish';
export const CF_TOPIC_ENTRY_UNPUBLISH = 'ContentManagement.Entry.unpublish';
export const CF_TOPIC_ENTRY_SAVE = 'ContentManagement.Entry.save';
export const CF_TOPIC_ENTRY_AUTO_SAVE = 'ContentManagement.Entry.auto_save';
export const CF_TOPIC_ENTRY_DELETE = 'ContentManagement.Entry.delete';
export const CF_TOPIC_ENTRY_ARCHIVE = 'ContentManagement.Entry.archive';
export const CF_TOPIC_ENTRY_UNARCHIVE = 'ContentManagement.Entry.unarchive';
export const CF_TOPIC_ENTRY_CREATE = 'ContentManagement.Entry.create';

export interface CfSpaceCredentials {
    spaceId: string;
    managementToken: string;
}

export interface CfArraySys {
    type : 'Array';
}

export interface CfArray<T> {
    sys : CfArraySys;
    total : number;
    skip : number;
    limit : number;
    items : T[];
}

export interface CfSpaceSys extends CfResourceSys {
    type : 'Space';
}

export interface CfSpace extends CfResource {
    sys : CfSpaceSys;
    name : string;
}

export interface CfEnvironmentSys extends CfSpaceResourceSys {
    type : 'Environment';
}

export interface CfEnvironment extends CfSpaceResource {
    sys : CfEnvironmentSys;
}

export interface CfOrganizationSys {
    type : 'Organization';
    id : string;
    version : number;
    createdAt : string;
    updatedAt : string;
}

export interface CfAssetFileImageSize {
    width : number;
    height : number;
}

export interface CfAssetFileDetails {
    size : number;
    image : CfAssetFileImageSize;
}

export interface CfAssetFile {
    contentType : string;
    fileName : string;
    url : string;
    details : CfAssetFileDetails;
}

export interface CfAssetFields {
    title : CfLocalizedValue<string>;
    file : CfLocalizedValue<CfAssetFile>;
}

export interface CfAssetSys extends CfSpaceResourceSys {
    type : 'Asset';
}

export interface CfAsset extends CfSpaceResource {
    sys : CfAssetSys;
    fields : CfAssetFields;
}

export interface CfOrganization {
    sys : CfOrganizationSys;
    name : string;
}

export interface CfLinkSys extends CfResourceSys {
    type : "Link";
    linkType : string;
    id : string;
}

export interface CfLink extends CfResource {
    sys : CfLinkSys;
}

/**
 * ContentfulType
 */

export interface CfValidationRange {
    min : number;
    max : number;
}

export interface CfValidationRegExp {
    pattern : string;
    flags? : unknown;
}

export interface CfTypeValidation {
    linkMimetypeGroup? : string[];
    linkContentType? : string[];
    range : CfValidationRange;
    message? : string;
    regexp? : CfValidationRegExp;
}

export interface CfArrayType {
    type : CfPrimitiveType;
    validations : CfTypeValidation[];
    linkType? : CfLinkType;
}

export type CfPrimitiveType = 'Link' | 'Boolean' | 'Integer' | 'Symbol' | 'Text' | 'Array' | 'Object';
export type CfLinkType = 'Asset' | 'Entry';

export interface CfTypeField {
    id : string;
    name : string;
    type : CfPrimitiveType;
    localized : boolean;
    required : boolean;
    validations : CfTypeValidation[];
    disabled : boolean;
    omitted : boolean;
    linkType? : CfLinkType;
    items : CfArrayType;
}

/**
 * Resource
 */

export interface CfResourceSys {
    type : string;
    id : string;
    createdAt? : string;
    updatedAt? : string;
}

export interface CfResource {
    sys : CfResourceSys;
}

/**
 * SpaceResource
 */

export interface CfSpaceResourceSys extends CfResourceSys {
    space : CfLink;
    environment : CfLink;
    publishedCounter : number;
    publishedVersion : number;
    publishedAt : string;
    firstPublishedAt : string;
    publishedBy : CfLink;
    createdBy : CfLink;
    updatedBy : CfLink;
    version : number;
}

export interface CfSpaceResource {
    sys : CfSpaceResourceSys;
}

/**
 * Type
 */

export interface CfType extends CfSpaceResource {
    displayField : string;
    name : string;
    description : string;
    fields : CfTypeField[];
}

/**
 * Entry
 */

export interface CfLocalizedValue<T = any> {
    [ lang : string ] : T;
}

export type CfEntryField = CfLocalizedValue | CfLink | CfLocalizedValue[] | CfLink[];

export interface CfEntryFields {
    [ id : string ] : CfEntryField;
}

export interface CfEntrySys extends CfSpaceResourceSys {
    contentType : CfLink;   
}

export interface CfEntryDefinition {
    fields : CfEntryFields;
}

export interface CfSnapshot {
    snapshot : CfEntry;
}

export interface CfEntry extends CfSpaceResource, CfEntryDefinition {
    sys : CfEntrySys;
}

export interface CfStore {
    contentTypes? : CfType[];
    assets? : CfAsset[];
    snapshots? : CfSnapshot[];
    publishedEntries? : CfEntry[];
    
    editorInterfaces? : any[]; // dont care
    locales? : any[]; // dont care
    webhooks? : any[]; // dont care
    roles? : any[]; // dont care

    entries? : CfEntry[];
}

export interface CfResourceQuery {
    limit? : number;
    skip? : number;
}

export interface CfEntryQuery extends CfResourceQuery {
    content_type? : string;
    select? : string;
    links_to_entry? : string;
    order? : string;
    mimetype_group? : string;
    locale? : string;

    [key : string]: any;
}

export function generateCfid() {
    return randomstring.generate({
        charset: 'hex',
        length: 64
    });
}

export interface CfAssetQuery extends CfResourceQuery {

}