import { Injectable } from "@alterior/di";
import { Context, CfArray, CfSpace, CfEnvironment, CfOrganization, CfEntry, CfSnapshot, CfAsset, CfStore, CfResourceQuery, CfEntryQuery, CfAssetQuery, CfEntryDefinition, generateCfid } from "../common";
import { timeout } from "@alterior/common";
import contentfulExport from 'contentful-export';
import fetch, { HeadersInit } from 'node-fetch';
import { RequestInit, BodyInit } from 'node-fetch';
import { ContentfulDeliveryService } from "./contentful-delivery";


@Injectable()
export class ContentfulManagementService {
    constructor(
        private context : Context,
        private contentfulDelivery : ContentfulDeliveryService
    ) {
    }

    async request<T>(method : string, url : string, body? : any, headers? : HeadersInit, state? : any): Promise<T> {
        if (!state) {
            state = {
                retry: 0
            }
        }

        let requestInit : RequestInit = {
            method,
            headers: Object.assign({}, headers, {
                Authorization: `Bearer ${this.context.definition.contentful.managementToken}`
            })
        };

        if (body) {
            let bodyText = JSON.stringify(body);
            requestInit.body = bodyText;
        }

        let fullUrl = `${this.baseUrl}/${url.replace(/^\//g, '')}`;
        let response = await fetch(fullUrl, requestInit);

        if (response.status === 429) {
            if (state.retry > 10) {
                console.error(`Contentful: ${method} ${url}: Too many retries (${state.retry})`);
                throw new Error(`Contentful: ${method} ${url}: Too many retries (${state.retry})`);
            }

            // Wait until Contentful is ready...

            let secondsRemaining = parseInt(response.headers.get('X-Contentful-RateLimit-Second-Remaining'));
            let jitter = Math.floor(secondsRemaining * 0.1 * Math.random() * 1000);
            await timeout(secondsRemaining * 1000 + jitter);

            state.retry += 1;
            await this.request(method, url, body, headers, state);
        } else if (response.status >= 400) {
            console.log(`${method} ${fullUrl} => ${response.status} ${response.statusText} (!!)`);
            console.error(`Got bad response from Contentful: ${response.status} ${response.statusText}`);
            console.error(`JSON:`);
            console.error(await response.json());
            throw response;
        }

        // success
        console.log(`${method} ${fullUrl} => ${response.status} ${response.statusText}`);
        return await response.json();
    }

    async get<T>(url : string, headers? : HeadersInit): Promise<T> {
        return await this.request<T>('GET', url, undefined, headers);
    }

    async getFromCollection<T>(url : string, query : CfResourceQuery, headers? : HeadersInit): Promise<CfArray<T>> {
        return await this.get(`${url}${this.queryString(query)}`, headers);
    }

    async post<T>(url : string, data : T, headers? : HeadersInit) {
        return await this.request('POST', url, data, headers);
    }

    async delete(url : string, headers? : HeadersInit) {
        return await this.request('DELETE', url, undefined, headers);
    }

    async put<T>(url : string, data : T, headers? : HeadersInit) {
        return await this.request('PUT', url, data, headers);
    }

    async getSpaces() {
        return await this.get<CfArray<CfSpace>>('/spaces');
    }

    async getSpace(id : string) {
        return await this.get<CfSpace>(`/spaces/${id}`);
    }

    get spaceId() {
        return this.context.definition.contentful.spaceId;
    }

    get managementToken() {
        return this.context.definition.contentful.managementToken;
    }

    get deliveryToken() {
        return this.context.definition.contentful.deliveryToken;
    }

    get environmentId() {
        return this.context.definition.contentful.environmentId || 'master';
    }

    async getEnvironments() {
        return await this.get<CfArray<CfEnvironment>>(`/spaces/${this.spaceId}/environments`);
    }

    async getEnvironment() {
        return await this.get<CfEnvironment>(`/spaces/${this.spaceId}/environments/${this.environmentId}`);
    }

    async getOrganizations() {
        return await this.get<CfArray<CfOrganization>>(`/organizations`);
    }

    async getOrganization(orgId : string) {
        return await this.get<CfOrganization>(`/organizations/${orgId}`);
    }

    queryString(query : any) {
        let queryParts = [];        
        for (let key of Object.keys(query))
            queryParts.push(`${key}=${encodeURIComponent(query[key])}`);

        return `?${queryParts.join('&')}`;
    }

    async fetchSchema(): Promise<CfStore> {
        console.log(`Fetching schema from Contentful...`);

        let result;

        result = await contentfulExport({
            skipContent: true,
            skipRoles: true,
            skipWebhooks: true,
            saveFile: false,

            ...this.context.definition.contentful
        });

        return result;
    }

    async fetchStore(): Promise<CfStore> {
        console.log(`Fetching data from Contentful...`);

        let result : CfStore = this.context.schema;

        result = await contentfulExport({
            skipContent: false,
            downloadAsset: false,
            skipRoles: true,
            skipWebhooks: true,
            saveFile: false,

            ...this.context.definition.contentful
        });

        //result.snapshots = await this.fetchAllSnapshots(result);

        console.log(`Fetching all published entries...`);
        result.publishedEntries = await this.contentfulDelivery.fetchAllPublishedEntries();
        console.log(` - Fetched ${result.publishedEntries.length} published entries`);

        return result;
    }

    async fetchAllSnapshots(schema : CfStore): Promise<CfSnapshot[]> {
        
        // Contentful conveniently ignores `snapshots` resource
        // in it's regular export tools, because it doesn't want you 
        // to successfully leave.

        let snapshots = [];

        console.log(`Fetching all snapshots for ${schema.contentTypes.length} content types...`);

        for (let contentType of schema.contentTypes) {
            let set = await this.getEntireCollection(`/spaces/${this.spaceId}/environments/master/content_types/${contentType.sys.id}/snapshots`);
            snapshots.push(...set);
        }

        console.log(`Fetched ${snapshots.length} snapshots.`);

        return snapshots;
    }
    
    async getEntireCollection<T>(collectionUrl : string) : Promise<T[]> {
        let skip = 0;
        let limit = 1000;
        let total = undefined;
        let items : T[] = [];

        while (true) {
            let page = await this.getFromCollection<T>(collectionUrl, { limit, skip });

            items.push(...page.items);

            skip += page.items.length;

            if (total === undefined) {
                total = page.total;
            }

            if (page.items.length < 1000)
                break;
        }

        return items;
    }

    async getEntries(query : CfEntryQuery) {
        return await this.get<CfArray<CfEntry>>(`/spaces/${this.spaceId}/environments/${this.environmentId}/entries?${this.queryString(query)}`);
    }

    async getEntry(entryId : string) {
        return await this.get<CfEntry>(`/spaces/${this.spaceId}/environments/${this.environmentId}/entries/${entryId}`);
    }

    async createEntry(contentTypeId : string, entry : CfEntryDefinition) {

        let entryId = generateCfid();

        console.log(`createEntry(sys.contentType=${contentTypeId}, sys.id=${entryId})`);
        return await this.put(
            `/spaces/${this.spaceId}/environments/${this.environmentId}/entries/${entryId}`, 
            entry, 
            {
                'X-Contentful-Content-Type': contentTypeId
            }
        );
    }

    async updateEntry(entry : CfEntry) {
        console.log(`updateEntry(sys.id=${entry.sys.id}, version=${entry.sys.version})`);
        return await this.put(
            `/spaces/${this.spaceId}/environments/${this.environmentId}/entries/${entry.sys.id}`, 
            entry,
            {
                'Content-Type': 'application/vnd.contentful.management.v1+json',
                'X-Contentful-Version': `${entry.sys.version}`,
                'X-Contentful-Content-Type': entry.sys.contentType.sys.id
            }
        );
    }

    async getSnapshots(entryId : string, query : any) {
        return await this.get<CfArray<CfSnapshot>>(`/spaces/${this.spaceId}/environments/${this.environmentId}/entries/${entryId}/snapshots?${this.queryString(query)}`);
    }

    async getLatestSnapshot(entryId : string) {
        return (await this.getSnapshots(entryId, { limit: 1 }))[0];
    }

    async getSnapshotsOfContentType(contentTypeId : string) {
        return await this.get<CfArray<CfSnapshot>>(`/spaces/${this.spaceId}/environments/${this.environmentId}/content_types/${contentTypeId}/snapshots`);
    }

    async getSnapshot(entryId : string, snapshotId : string) {
        return await this.get<CfSnapshot>(`/spaces/${this.spaceId}/environments/${this.environmentId}/entries/${entryId}/snapshots/${snapshotId}`);
    }

    async publishEntry(entryId : string, version : number) {
        return await this.put(`/spaces/${this.spaceId}/environments/${this.environmentId}/entries/${entryId}/published`, {
            'X-Contentful-Version': `${version}`
        });
    }

    async unpublishEntry(entryId : string, version : number) {
        return await this.delete(`/spaces/${this.spaceId}/environments/${this.environmentId}/entries/${entryId}/published`, {
            'X-Contentful-Version': `${version}`
        });
    }

    async getAsset(spaceId : string, envId : string, assetId : string) {
        return await this.get<CfAsset>(`/spaces/${spaceId}/environments/${envId}/assets/${assetId}`)
    }

    async getAssets(spaceId : string, envId : string, query : CfAssetQuery) {
        return await this.get<CfArray<CfAsset>>(`/spaces/${spaceId}/environments/${envId}/assets${this.queryString(query)}`)
    }

    async archiveEntry(spaceId : string, envId : string, entryId : string, version : number) {
        return await this.put(`/spaces/${spaceId}/environments/${envId}/entries/${entryId}/archived`, {
            'X-Contentful-Version': `${version}`
        });
    }

    async unarchiveEntry(spaceId : string, envId : string, entryId : string, version : number) {
        return await this.delete(`/spaces/${spaceId}/environments/${envId}/entries/${entryId}/archived`, {
            'X-Contentful-Version': `${version}`
        });
    }

    async deleteEntry(spaceId : string, envId : string, entryId : string, version : number) {
        return await this.delete(`/spaces/${spaceId}/environments/${envId}/entries/${entryId}`, {
            'X-Contentful-Version': `${version}`
        });
    }

    get baseUrl() {
        return `https://api.contentful.com`;
    }
}