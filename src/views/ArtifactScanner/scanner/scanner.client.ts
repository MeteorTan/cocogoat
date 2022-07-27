import { Remote, wrap } from 'comlink'
import type { W } from './scanner.expose'
import resources from '@/resources'
import { requireAsBlob, speedTest } from '@/resource-main'
import { WorkerMacro } from '@/utils/corsWorker'
import { hasSIMD } from '@/utils/compatibility'
import { i18n } from '@/i18n'
import charactersAmos from '@/plugins/amos/characters/index'
import artifactAmos from '@/plugins/amos/artifacts/index'
import { IMatFromImageElement } from '@/utils/IMat'
import { cloneDeep } from 'lodash-es'
import { localOptions } from '@/store'
export function createWorker() {
    const _worker = WorkerMacro(/* @worker './scanner.expose.ts' */)
    const worker = wrap(_worker) as Remote<typeof W>
    return { worker, _worker }
}
export function initScanner() {
    const { worker: workerCV, _worker: w1 } = createWorker()
    const { worker: workerOCR, _worker: w2 } = createWorker()
    const { onScreenShot, diffCached, diffCachedA, diffAB } = workerCV
    const { onScreenShot: onScreenShot2 } = workerOCR
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    let progressHandler = (progress: number) => {
        // do nothing
    }
    const onProgress = (handler: (progress: number) => unknown) => {
        progressHandler = handler
    }
    const workerErrorHandler = (e: ErrorEvent) => {
        progressHandler(-99)
        throw e
    }
    w1.addEventListener('error', workerErrorHandler)
    w2.addEventListener('error', workerErrorHandler)
    const initPromise = (async () => {
        try {
            const [race, all] = speedTest()
            const ortWasm = hasSIMD ? 'ort-wasm-simd.wasm' : 'ort-wasm.wasm'
            const ocvWasm = hasSIMD ? 'opencv-simd.wasm' : 'opencv-normal.wasm'
            await race
            await requireAsBlob([ortWasm, ocvWasm, 'yas.ort'], (e) => progressHandler(e), all)
            const map = {
                map: artifactAmos,
                characters: charactersAmos,
                amos: cloneDeep(i18n.amos),
                params: cloneDeep(i18n.atifactParams),
            }
            await Promise.all([
                workerCV.setResources(resources),
                workerOCR.setResources(resources),
                workerCV.initMap(map),
                workerOCR.initMap(map),
            ])
            progressHandler(100)
        } catch (e) {
            progressHandler(-1)
            throw e
        }
        w1.removeEventListener('error', workerErrorHandler)
        w2.removeEventListener('error', workerErrorHandler)
        await Promise.all([workerCV.init(localOptions.value.onnxWebgl), workerOCR.init(localOptions.value.onnxWebgl)])
    })()

    return {
        onScreenShot,
        onScreenShot2,
        initPromise,
        workerCV,
        workerOCR,
        onProgress,
        IMatFromImageElement,
        diffAB,
        diffCached,
        diffCachedA,
    }
}
let scannerInstance: ReturnType<typeof initScanner>
export function getScannerInstance() {
    if (!scannerInstance) {
        scannerInstance = initScanner()
    }
    return scannerInstance
}
