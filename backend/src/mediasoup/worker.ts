import * as mediasoup from 'mediasoup'
import type { Worker } from 'mediasoup/node/lib/types'
import { config } from '../config'

const workers: Worker[] = []
let nextWorkerIndex = 0

export async function createWorkers(): Promise<void> {
  for (let i = 0; i < config.mediasoup.numWorkers; i++) {
    const worker = await mediasoup.createWorker({
      logLevel: config.mediasoup.workerSettings.logLevel,
      rtcMinPort: config.mediasoup.workerSettings.rtcMinPort,
      rtcMaxPort: config.mediasoup.workerSettings.rtcMaxPort,
    })

    worker.on('died', () => {
      console.error(`[mediasoup] Worker died [pid:${worker.pid}], exiting in 2s`)
      setTimeout(() => process.exit(1), 2000)
    })

    workers.push(worker)
    console.log(`[mediasoup] Worker created [pid:${worker.pid}]`)
  }
}

export function getNextWorker(): Worker {
  const worker = workers[nextWorkerIndex]!
  nextWorkerIndex = (nextWorkerIndex + 1) % workers.length
  return worker
}
