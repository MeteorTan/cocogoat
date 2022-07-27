import { cvTranslateError, getCV, ICVMat, toIMat, fromIMat } from '@/utils/cv'
import type { Mat, Rect } from '@/utils/opencv'
import { cvDiffImage, cvGetRect, cvSplitAchievement, cvSplitImage } from './cvUtils'
import { recognize, init as getOCR } from '@/modules/ocr'
import { Achievement } from '@/typings/Achievement'
import { achievementTitles, achievementEC, achievementSubs, amos, filter } from './achievementsList'
import { textBestmatch } from '@/utils/textMatch'
export { recognize } from '@/modules/ocr'
export { toIMat, fromIMat } from '@/utils/cv'

export let lastImage: Mat | null = null
export let rect: Rect | null = null

export function getRect() {
    return rect
}

export function reset() {
    if (lastImage) {
        try {
            lastImage.delete()
        } catch (e) {}
    }
    lastImage = null
    rect = null
}

export interface IAScannerBase {
    result?: {
        title: Awaited<ReturnType<typeof recognize>>
        subtitle: Awaited<ReturnType<typeof recognize>>
        status: Awaited<ReturnType<typeof recognize>>
        date: Awaited<ReturnType<typeof recognize>>
    }
    images?: Record<string, string>
    blocks?: {
        name: string
        rect: Rect
    }[]
}
export interface IAScannerFaild extends IAScannerBase {
    success: false
}
export interface IAScannerData extends IAScannerBase {
    success: true
    done: boolean
    achievement: Achievement
    status: string
    date: string
}

export interface IAScannerBlocks {
    image: ICVMat
    blocks: {
        name: string
        rect: Rect
        image: ICVMat
    }[]
}
export interface IAScannerLine {
    image: ICVMat
    x: number
    y: number
}
export async function scannerOnLine(data: ICVMat) {
    const cv = await getCV()
    const raw = fromIMat(cv, data)
    cv.cvtColor(raw, raw, cv.COLOR_RGBA2RGB, 0)
    const splited = cvSplitAchievement(cv, raw).map((e) => {
        if (e.name === 'subtitle') {
            cv.cvtColor(e.roi, e.roi, cv.COLOR_RGB2GRAY, 0)
            cv.threshold(e.roi, e.roi, 195, 255, cv.THRESH_BINARY)
            cv.cvtColor(e.roi, e.roi, cv.COLOR_GRAY2RGB, 0)
        }
        if (e.name === 'date' || e.name === 'subtitle') {
            const M = cv.matFromArray(3, 3, cv.CV_32FC1, [-1, -1, -1, -1, 9, -1, -1, -1, -1])
            cv.filter2D(e.roi, e.roi, cv.CV_8U, M, new cv.Point(-1, -1), 0, cv.BORDER_DEFAULT)
            M.delete()
            cv.cvtColor(e.roi, e.roi, cv.COLOR_RGB2GRAY, 0)
            cv.threshold(e.roi, e.roi, 195, 255, cv.THRESH_BINARY)
            cv.cvtColor(e.roi, e.roi, cv.COLOR_GRAY2RGB, 0)
        }
        const tmpData = toIMat(cv, e.roi)
        e.roi.delete()
        return {
            name: e.name,
            rect: e.rect,
            image: tmpData,
        }
    })
    if (!splited || splited.length <= 0) {
        return {
            success: false,
            blocks: splited.map((e) => ({ ...e, image: undefined })),
        } as IAScannerFaild
    }
    return await recognizeAchievement({
        image: data,
        blocks: splited,
    })
}
export async function scannerSplitLine(data: ICVMat) {
    const cv = await getCV()
    const raw = fromIMat(cv, data)
    return cvSplitAchievement(cv, raw).map((e) => {
        const tmpData = toIMat(cv, e.roi)
        e.roi.delete()
        return {
            name: e.name,
            rect: e.rect,
            image: tmpData,
        }
    })
}
export async function scannerOnImage(data: ICVMat, keepLastRow = false, skipDiff = false) {
    const cv = await getCV()
    try {
        /* cut rect */
        const raw = fromIMat(cv, data)
        if (!rect) {
            rect = await cvGetRect(raw)
        }
        if (!rect) {
            rect = new cv.Rect(0, 0, raw.cols, raw.rows)
        }
        let src = raw.roi(rect)
        raw.delete()
        /* get rows & remove last row */
        if (!keepLastRow) {
            const rows = await cvSplitImage(src)
            let k = rows.length - 1
            while (src.rows - rows[k] < 10) {
                k--
            }
            const tmp = src.roi(new cv.Rect(0, 0, src.cols, Math.min(rows[k] + 10, src.rows)))
            src.delete()
            src = tmp
        }
        let img = src.clone()
        /* diff */
        if (!skipDiff && lastImage) {
            const diff = await cvDiffImage(lastImage, img)
            if (!diff) {
                // 滚动太小，不处理
                src.delete()
                img.delete()
                return []
            }
            img.delete()
            img = diff
            try {
                lastImage.delete()
            } catch (e) {}
            lastImage = null
        }
        /* get new rows */
        const rows = await cvSplitImage(img)
        const results: IAScannerLine[] = []
        rows.forEach((i, index) => {
            const y = index === 0 ? 0 : rows[index - 1]
            const h = index === 0 ? i : i - rows[index - 1]
            const rect = new cv.Rect(0, y, img.cols, h)
            const tmp = img.roi(rect)
            const tmpData = toIMat(cv, tmp)
            results.push({
                image: tmpData,
                x: 0,
                y,
            })
            try {
                tmp.delete()
            } catch (e) {}
        })
        img.delete()
        if (!skipDiff) {
            lastImage = src
        } else {
            src.delete()
        }
        return results
    } catch (e) {
        throw cvTranslateError(cv, e)
    }
}

// eslint-disable-next-line complexity
export async function recognizeAchievement(line: IAScannerBlocks): Promise<IAScannerData | IAScannerFaild> {
    let res: Achievement | null = null
    const title = line.blocks.find((e) => e.name === 'title')
    const subtitles = line.blocks.filter((e) => e.name === 'subtitle')
    // get subtitle with maxium width
    const subtitle = subtitles.reduce((prev, curr) => {
        if (curr.rect.width > prev.rect.width) {
            return curr
        }
        return prev
    }, subtitles[0])
    const result = {
        title: {},
        subtitle: {},
        status: {},
        date: {},
    } as Exclude<IAScannerData['result'], undefined>
    if (title && subtitle) {
        const titleText = await recognize(title.image)
        titleText.text = titleText.text.replace(filter, '')
        result.title = titleText
        const titleObj = !isNaN(titleText.confidence) ? achievementTitles.find((e) => e.str === titleText.text) : false
        if (
            titleObj &&
            titleText.confidence > 85 &&
            !/.*[0-9]{1,}.*/.test(amos[titleObj.obj.desc]) &&
            !amos[titleObj.obj.desc].includes('次')
        ) {
            res = titleObj.obj
        } else {
            const subtitleText = await recognize(subtitle.image)
            subtitleText.text = subtitleText.text.replace(filter, '')
            result.subtitle = subtitleText
            const ecStr = `${titleText.text}-${subtitleText.text}`
            const matched = textBestmatch('str', ecStr, achievementEC, ecStr.length / 3)
            if (matched) {
                res = matched.obj
            } else {
                const matched = textBestmatch('str', subtitleText.text, achievementSubs, subtitleText.text.length / 3)
                if (matched) {
                    res = matched.obj
                }
            }
        }
    }
    if (res) {
        let done = true
        const status = line.blocks.find((e) => e.name === 'status')
        const date = line.blocks.find((e) => e.name === 'date')
        if (status) {
            result.status = await recognize(status.image)
            const statusArr = result.status.text
                .split('/')
                .map((e) => e.trim())
                .filter((e) => !!e)
            if (statusArr.length === 2) {
                const [f, fin] = statusArr
                if (!isNaN(Number(f)) && !isNaN(Number(fin)) && f < fin) {
                    // 未完成
                    done = false
                }
            }
        }
        if (date) {
            result.date = await recognize(date.image)
            // 如果日期长度<4，我们认为是没完成的
            if (result.date.text.length < 4) {
                done = false
            }
            // 修复/识别成1/7的问题
            if (result.date.text.length === 10) {
                if (result.date.text[4] === '1' || result.date.text[4] === '7') {
                    result.date.text = result.date.text.substring(0, 4) + '/' + result.date.text.substring(5)
                }
                if (result.date.text[7] === '1' || result.date.text[7] === '7') {
                    result.date.text = result.date.text.substring(0, 7) + '/' + result.date.text.substring(8)
                }
            }
        } else {
            // 没有切出日期片，也认为是没有完成
            done = false
        }
        const ret = {
            success: true,
            done,
            achievement: res,
            status: result.status?.text ?? '',
            date: result.date?.text ?? '',
            result,
        }
        if (ret.status === '达成') {
            ret.done = true
        }
        return ret
    } else {
        return {
            success: false,
            result,
            blocks: line.blocks.map((e) => ({ ...e, image: undefined })),
        }
    }
}

export async function init(webgl = false) {
    await Promise.all([getOCR(webgl), getCV()])
}
