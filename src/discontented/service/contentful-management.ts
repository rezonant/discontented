import { Injectable } from "@alterior/di";
import { Context, CfArray, CfSpace, CfEnvironment, CfOrganization, CfEntry, CfSnapshot } from "../common";
import { timeout } from "@alterior/common";

export interface CfEntryQuery {
    content_type : string;
    select : string;
    links_to_entry : string;
    order : string;
    limit : number;
    skip : number;
    mimetype_group : string;
    locale : string;

    [key : string]: any;
}

@Injectable()
export class ContentfulManagementService {
    constructor(
        private context : Context
    ) {
    }

    async request<T>(method : string, url : string, body? : any, state? : any): Promise<T> {
        if (!state) {
            state = {
                retry: 0
            }
        }

        let requestInit : RequestInit = {
            method,
            headers: {
                Authorization: `Bearer ${this.context.definition.contentful.managementToken}`
            }
        };

        if (body) {
            let bodyText = JSON.stringify(body);
            requestInit.body = bodyText;
        }

        let response = await fetch(`${this.baseUrl}/${url.replace(/^\//g, '')}`, requestInit);

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
            await this.request(method, url, body, state);
        } else if (response.status >= 400) {
            throw response;
        }

        // success
        return await response.json();
    }

    async get<T>(url : string, headers? : HeadersInit): Promise<T> {
        return await this.request<T>('GET', url, undefined, headers);
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

    async getEntries(query : CfEntryQuery) {
        return await this.get<CfArray<CfEntry>>(`/spaces/${this.spaceId}/environments/${this.environmentId}/entries?${this.queryString(query)}`);
    }

    async getEntry(entryId : string) {
        return await this.get<CfEntry>(`/spaces/${this.spaceId}/environments/${this.environmentId}/entries/${entryId}`);
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