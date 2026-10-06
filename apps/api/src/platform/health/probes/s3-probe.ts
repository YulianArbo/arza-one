import { HeadBucketCommand, S3Client } from '@aws-sdk/client-s3';

import { PROBE_TIMEOUT_MS, type HealthProbe } from '../health-probe.js';

export interface S3ProbeOptions {
  readonly endpoint: string;
  readonly region: string;
  readonly bucket: string;
  readonly accessKeyId: string;
  readonly secretAccessKey: string;
}

/** Comprueba que el depósito de archivos exista y que las credenciales lo alcancen. */
export class S3Probe implements HealthProbe {
  readonly component = 'files';
  private readonly client: S3Client;

  constructor(private readonly options: S3ProbeOptions) {
    const { endpoint, region, accessKeyId, secretAccessKey } = options;
    this.client = new S3Client({
      endpoint,
      region,
      credentials: { accessKeyId, secretAccessKey },
      forcePathStyle: true,
      maxAttempts: 1,
    });
  }

  async check(): Promise<void> {
    await this.client.send(new HeadBucketCommand({ Bucket: this.options.bucket }), {
      abortSignal: AbortSignal.timeout(PROBE_TIMEOUT_MS),
    });
  }
}
