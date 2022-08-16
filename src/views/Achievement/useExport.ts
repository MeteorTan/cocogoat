import { apibase } from './../../utils/apibase'
import { i18n } from '@/i18n'
import { ElMessageBox, ElNotification } from 'element-plus'
import 'element-plus/theme-chalk/el-notification.css'
import { ref } from 'vue'
import { store, options } from '@/store'
import dayjs from 'dayjs'
import achevementsAmos from '@/plugins/amos/achievements'
import { cloneDeep } from 'lodash-es'
import copy from 'copy-to-clipboard'
import { IAchievementStore, UIAF, UIAFMagicTime } from '@/typings/Achievement'
import { getUrl } from '@/router'
export function getV1Json() {
    let ach0 = cloneDeep(store.value.achievements)
    ach0 = ach0.filter((i) => !Array.isArray(i.partial))
    ach0.forEach((e) => {
        e.images = undefined
        e.partial = undefined
        e.partialDetail = undefined
    })
    return ach0
}
export function useExportAchievements() {
    const exportData = ref({
        show: false,
        title: '',
        content: '',
    })
    const doExport = (
        _to: 'paimon' | 'seelie' | 'cocogoat' | 'cocogoat.v2' | 'excel' | 'snapgenshin' | 'uiaf' | 'share' | '',
    ) => {
        const to = _to || options.value.achievements_recent_export
        if (to !== 'share') options.value.achievements_recent_export = to
        if (to === 'cocogoat') {
            const ach0 = getV1Json()
            const data = {
                source: '椰羊成就',
                value: {
                    achievements: ach0,
                },
                lastModified: new Date().toISOString(),
            }
            const jstr = JSON.stringify(data, null, 4)
            // save to file
            const blob = new Blob([jstr], { type: 'application/json' })
            const url = URL.createObjectURL(blob)
            const a = document.createElement('a')
            a.href = url
            a.download = '椰羊成就导出 ' + dayjs().format('YYYYMMDDHHmmss') + '.cocogoat-v1.json'
            a.click()
            return
        }
        if (to === 'cocogoat.v2') {
            const ach0 = cloneDeep(store.value.achievements)
            ach0.forEach((e) => {
                e.images = undefined
            })
            const data = {
                source: '椰羊成就',
                value: {
                    achievements: ach0,
                },
                lastModified: new Date().toISOString(),
            }
            const jstr = JSON.stringify(data, null, 4)
            // save to file
            const blob = new Blob([jstr], { type: 'application/json' })
            const url = URL.createObjectURL(blob)
            const a = document.createElement('a')
            a.href = url
            a.download = '椰羊成就导出 ' + dayjs().format('YYYYMMDDHHmmss') + '.cocogoat-v2.json'
            a.click()
            return
        }
        if (to === 'share') {
            ;(async () => {
                const msg = ElNotification({
                    message: '正在创建分享，请稍候...',
                    duration: 0,
                    showClose: false,
                    type: 'info',
                })
                const ach0 = cloneDeep(store.value.achievements)
                ach0.forEach((e) => {
                    e.images = undefined
                })
                const data = {
                    achievements: ach0,
                }
                try {
                    const res = await fetch(await apibase('/v2/memo?source=分享链接'), {
                        method: 'POST',
                        headers: {
                            'Content-Type': 'application/json',
                        },
                        body: JSON.stringify(data),
                    })
                    if (!res.ok) {
                        let err = res.statusText
                        try {
                            err = await res.text()
                        } catch (e) {}
                        throw new Error(err)
                    }
                    const rdata = await res.json()
                    if (!rdata.key) {
                        throw new Error('No key')
                    }
                    const link = new URL(
                        getUrl('achievement.index', false, { memo: rdata.key }),
                        location.href,
                    ).toString()
                    try {
                        msg.close()
                    } catch (e) {}
                    try {
                        await ElMessageBox.prompt(
                            '打开以下分享链接，即可快速导入成就。注意：每个分享链接只能导入一次。',
                            '分享链接创建成功',
                            {
                                confirmButtonText: '复制链接',
                                cancelButtonText: '关闭',
                                inputValue: link,
                            },
                        )
                        copy(link)
                        ElNotification({
                            message: '分享链接已复制到剪贴板',
                            type: 'success',
                        })
                    } catch (e) {
                        console.log(e)
                    }
                } catch (e) {
                    try {
                        msg.close()
                    } catch (e) {}
                    console.error(e)
                    return ElNotification.error('分享失败，请稍后再试')
                }
            })()
            return
        }
        if (to === 'uiaf') {
            const data = toUIAF(getV1Json())
            const jstr = JSON.stringify(data, null, 4)
            const blob = new Blob([jstr], { type: 'application/json' })
            const url = URL.createObjectURL(blob)
            const a = document.createElement('a')
            a.href = url
            a.download = '椰羊UIAF ' + dayjs().format('YYYYMMDDHHmmss') + '.json'
            a.click()
            return
        }
        if (to === 'snapgenshin') {
            // const ach0 = toUIAF(store.value.achievements)
            const ach0 = getV1Json().map((e) => {
                return {
                    Id: e.id,
                    TimeStamp: Math.floor(new Date(e.date).getTime() / 1000),
                }
            })
            const f = document.createElement('iframe')
            // f.src = 'snapgenshin://achievement/import/uiaf'
            f.src = 'snapgenshin://achievement/import/clipboard'
            f.style.display = 'none'
            copy(JSON.stringify(ach0))
            document.body.appendChild(f)
            setTimeout(() => {
                document.body.removeChild(f)
            }, 1000)
            ElNotification.success({
                title: '已发起自动导入',
                message: '如果SnapGenshin没有启动或导入失败，请导出为椰羊JSON后手动导入。',
                duration: 15 * 1e3,
            })
            return
        }
        if (to === 'excel') {
            dumpToExcel()
            return
        }
        let content = ''
        if (to === 'seelie') {
            const exportArray = getV1Json().map((i) => {
                return [i.id, (i.status + ' ' + i.date).trim()]
            })
            content = `/*
* 复制此处所有内容，
* 在Seelie.me页面按F12打开调试器，
* 选择控制台(Console)
* 粘贴并回车执行完成导入
* 
* 使用此方法导入是为了保证您的原有成就不被覆盖
*
*/
const z = ${JSON.stringify(exportArray)};
const a = localStorage.account || 'main'
const b = JSON.parse(localStorage.getItem(\`\${a}-achievements\`)||'{}')
z.forEach(c=>{b[c[0]]={done:true,notes:c[1]}})
localStorage.setItem(\`\${a}-achievements\`,JSON.stringify(b))
localStorage.last_update = (new Date()).toISOString()
location.href='/achievements'`
        } else {
            const exportArray = getV1Json().map((a) => {
                return [a.categoryId, a.id]
            })
            content = `/*
* 复制此处所有内容，
* 在Paimon.moe页面按F12打开调试器，
* 选择控制台(Console)
* 粘贴并回车执行完成导入
* 
* 使用此方法导入是为了保证您的原有成就不被覆盖
*
*/
const b = ${JSON.stringify(exportArray)};
const a = (await localforage.getItem('achievement')) || {};
b.forEach(c=>{a[c[0]]=a[c[0]]||{};a[c[0]][c[1]]=true})
await localforage.setItem('achievement',a);
location.href='/achievement'`
        }
        exportData.value = {
            show: true,
            content,
            title: '导出到' + (to === 'paimon' ? 'Paimon.moe' : 'Seelie.me'),
        }
        // do nothing
    }
    return { exportData, doExport }
}

export function toUIAF(data: IAchievementStore[]): UIAF {
    const uiaf: UIAF = {
        info: {
            export_app: 'cocogoat',
            export_app_version: process.env.VUE_APP_GIT_SHA || 'unkonwn',
            export_timestamp: Math.floor(Date.now() / 1000),
            uiaf_version: 'v1.0',
        },
        list: [],
    }
    data.forEach((e) => {
        if (e.partial && e.partial.length > 0) return
        const dt = new Date(e.date).getTime()
        const val = (e.status.match(/[0-9/]+/g) || []).join('').split('/')[0]
        uiaf.list.push({
            id: e.id,
            timestamp: Math.floor(dt > 0 ? dt / 1000 : UIAFMagicTime),
            current: Number(val) || 0,
        })
    })
    return uiaf
}
async function dumpToExcel() {
    const noti = ElNotification.info({
        title: '处理中',
        message: '请稍候...',
        duration: 0,
    })
    const exceljs = await import('exceljs')
    const workbook = new exceljs.Workbook()
    const worksheet = workbook.addWorksheet('椰羊成就导出')
    worksheet.columns = [
        { header: 'ID', key: 'id' },
        { header: '分类', key: 'category' },
        { header: '名称', key: 'name' },
        { header: '原石', key: 'reward' },
        { header: '描述', key: 'desc' },
        { header: '状态', key: 'status' },
        { header: '日期', key: 'date' },
    ]
    // convert data
    achevementsAmos.forEach((category) => {
        category.achievements.forEach((achievement) => {
            const ach = getV1Json().find((i) => i.id === achievement.id)
            worksheet.addRow({
                id: achievement.id,
                category: i18n.amos[category.name],
                name: i18n.amos[achievement.name],
                desc: i18n.amos[achievement.desc],
                reward: achievement.reward,
                status: ach ? ach.status : '未完成',
                date: ach ? ach.date : '',
            })
        })
    })
    // download xlsx
    noti.close()
    ElNotification.success({
        title: '导出成功',
        message: '即将下载...',
    })
    const buf = await workbook.xlsx.writeBuffer()
    const blob = new Blob([buf], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = '椰羊成就导出' + dayjs().format('YYYY-MM-DD HH:mm:ss') + '.xlsx'
    a.click()
}
