
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
    createdAt : string;
    updatedAt : string;
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

export interface CfEntry extends CfSpaceResource {
    sys : CfEntrySys;
    fields : CfEntryFields;
}

export interface CfStore {
    contentTypes? : CfType[];
    editorInterfaces? : any[]; // dont care
    locales? : any[]; // dont care
    webhooks? : any[]; // dont care
    roles? : any[]; // dont care

    entries? : CfEntry[];
}
