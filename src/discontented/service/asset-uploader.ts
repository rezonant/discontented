import { Injectable } from '@alterior/di';
import { CfAsset, Context, Bucket } from '../common';
import * as AWS from 'aws-sdk';

interface DownloadedFile {
    buffer : Buffer;
    contentType : string;
}

interface BucketObjectMap {
    ready : Promise<void>;
    objects : Set<string>;
}

@Injectable()
export class AssetUploader {
    constructor(
        private context : Context
    ) {
    }

    #map = new Map<string, BucketObjectMap>();

    getBucketKey(bucket : Bucket) {
        return `${bucket.endpoint ? `${bucket.endpoint}|` : ''
            }${bucket.region ? `${bucket.region}|` : ''
            }${bucket.bucket}`
        ;
    }

    async bucketHasObject(bucket : Bucket, objectKey : string) {
        let bucketKey = this.getBucketKey(bucket);
        if (!this.#map.has(bucketKey)) {
            console.log(`[BucketMap] Creating map of bucket key=${bucketKey}`);

            let keysRead = 0;
            let progress = setInterval(
                () => console.log(`[BucketMap] ${bucketKey}: ${keysRead} objects found...`), 
                10*1000
            );

            let startedAt = Date.now();

            try {
                let markReady : () => void, reject : (e) => void;
                let ready = new Promise<void>((rs, rj) => (markReady = rs, reject = rj));
                let objects = new Set<string>();
                this.#map.set(bucketKey, {
                    ready,
                    objects
                });

                await new Promise<void>(async (done, raise) => {
                    await this.s3ForBucket(bucket)
                        .listObjects({ Bucket: bucket.bucket })
                        .eachPage((err, data) => {
                            if (err) {
                                raise(err);
                                return false;
                            }

                            if (!data) {
                                done();
                                return false;
                            }

                            for (let object of data.Contents)
                                objects.add(object.Key);

                            keysRead += data.Contents.length;
                            return true;
                        })
                ;
                });

                console.log(`[BucketMap] Finished building map for ${bucketKey} in ${Date.now() - startedAt}ms: ${keysRead} objects total`);
                markReady();
            } finally {
                clearInterval(progress);
            }
        }
            
        let map = this.#map.get(bucketKey);
        await map.ready;

        return map.objects.has(objectKey);
    }

    s3ForBucket(bucket : Bucket) {
        return new AWS.S3({
            endpoint: bucket.endpoint,
            region: bucket.region,
            credentials: {
                accessKeyId: bucket.accessKey,
                secretAccessKey: bucket.accessSecret
            }
        });
    }

    async transfer(asset : CfAsset) {
        if (!this.context.definition.assetBuckets || this.context.definition.assetBuckets.length === 0)
            return;

        if (!asset.fields.file) {
            console.log(`WARNING: Skipping asset ${asset.sys.id}: No file associated.`);
            return;
        }

        if (!asset.fields.file[this.context.defaultLocalization]) {
            console.log(`ERROR: Skipping asset ${asset.sys.id}: No file for default locale ${this.context.defaultLocalization}!`);
            return;
        }

        let downloadPromise : Promise<DownloadedFile>;
        let url = `https:${asset.fields.file[this.context.defaultLocalization].url}`;
        let urlObj = new URL(url);
        let objectKey = `${urlObj.pathname.slice(1)}`;

        function sleep(time) {
            return new Promise<void>(resolve => setTimeout(() => resolve(), time));
        }

        function download() {
            if (downloadPromise)
                return downloadPromise;

            return downloadPromise = new Promise(async (resolve, reject) => {
                let attempt = 0;
                let maxAttempts = 5;

                while (attempt <= maxAttempts) {
                    try {
                        if (attempt > 0)
                            console.log(`Attempting to download '${url}' again (attempt number #${attempt + 1})`);
                        let response = await fetch(url);
                        let arrayBuffer = await response.arrayBuffer();
                        resolve({ buffer: Buffer.from(arrayBuffer), contentType: response.headers.get('content-type') });
                        return;
                    } catch (e) {
                        console.error(`ERROR: While downloading asset ${asset.sys.id}: ${e.message}`);
                        attempt += 1;

                        if (attempt <= maxAttempts)
                            console.error(`       Waiting 5 seconds before trying again`);
                        
                        console.error(e);
                        await sleep(5000);
                    }
                }

                reject(new Error(`Failed to download file '${url}' after ${maxAttempts}!`));
            });
        }

        await Promise.all(this.context.definition.assetBuckets.map(async bucket => {
            if (await this.bucketHasObject(bucket, objectKey))
                return;

            let file: DownloadedFile;
            try {
                file = await download();
            } catch (e) {
                console.error(`Failed to download URL '${url}'! This will be skipped!`);
                return;
            }

            let attempt = 0;
            let maxAttempts = 5;

            while (attempt <= maxAttempts) {
                try {
                    await this.s3ForBucket(bucket)
                        .putObject({
                            Bucket: bucket.bucket,
                            Body: file.buffer,
                            Key: objectKey,
                            ContentType: file.contentType
                        })
                        .promise()
                    ;
                    return;
                } catch (e) {
                    console.error(`ERROR: While uploading asset ${asset.sys.id} to bucket ${bucket.bucket} (attempt ${attempt+1}): ${e.message}`);
                    attempt += 1;

                    if (attempt <= maxAttempts)
                        console.error(`       Waiting 5 seconds before trying again for attempt ${attempt+1}`);
                    
                    sleep(5000);
                }
            }

            console.error(`ERROR: Failed to upload asset ${asset.sys.id} to bucket ${bucket.bucket} after ${maxAttempts} attempts!`);
            console.error(`       It will be skipped for now.`);
        }));
    }
}