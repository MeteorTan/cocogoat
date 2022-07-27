import { IAchievementStore } from '@/typings/Achievement'
import { IArtifact } from '@/typings/Artifact'
import { currentUser as storageCurrentUser, get, set, list } from './impl'
import { Ref, ref, watch } from 'vue'

export const disableAutoSave = ref(false)

export function createEmptyStore() {
    return {
        achievements: [] as IAchievementStore[],
        artifacts: [] as IArtifact[],
        user: {
            name: '默认',
            avatar: 'traveler',
        },
    }
}
export type IStore = ReturnType<typeof createEmptyStore>
export function createEmptyOptions() {
    return {
        lang: navigator.language.toLowerCase(),
        modelLang: navigator.language.toLowerCase(),
        achievements_recent_export: 'paimon',
        achievements_show_unpublished: false,
        reporting: true,
        showads: true,
    }
}
export type IOptions = ReturnType<typeof createEmptyOptions>

export function createEmptyLocalOptions() {
    return {
        onnxWebgl: false,
    }
}
export type ILocalOptions = ReturnType<typeof createEmptyLocalOptions>

export function loadStore(): IStore {
    const uid = storageCurrentUser()
    const data = get(uid) || {}
    return Object.assign(createEmptyStore(), data)
}
export function loadOptions(): IOptions {
    const data = get('options') || {}
    return Object.assign(createEmptyOptions(), data)
}
export function loadLocalOptions(): ILocalOptions {
    const data = get('localopt') || {}
    return Object.assign(createEmptyLocalOptions(), data)
}
export function loadAllUsers() {
    const keys = list()
    const alist = keys.map((key) => ({
        id: key,
        ...(get(key) as IStore).user,
    }))
    if (!keys.find((e) => e == currentUser.value)) {
        alist.unshift({
            id: currentUser.value,
            name: '默认',
            avatar: 'traveler',
        })
    }
    return alist
}
export function useAutoSave(currentUser: Ref<string>, store: Ref<IStore>, options: Ref<IOptions>) {
    const watchStore = () =>
        watch(
            store,
            (storeval) => {
                if (disableAutoSave.value) return
                set(currentUser.value, storeval)
                const changedUser = storageCurrentUser()
                if (changedUser !== currentUser.value) {
                    storageCurrentUser(currentUser.value)
                }
            },
            { deep: true },
        )
    let unwatch = watchStore()
    watch(currentUser, (user) => {
        if (disableAutoSave.value) return
        unwatch()
        const changedUser = storageCurrentUser()
        if (changedUser !== user) {
            storageCurrentUser(user)
            store.value = loadStore()
        }
        unwatch = watchStore()
    })
    watch(
        options,
        (options) => {
            if (disableAutoSave.value) return
            set('options', options)
        },
        { deep: true },
    )
}
export const currentUser = ref(storageCurrentUser())
export const store = ref(loadStore())
export const options = ref(loadOptions())
export const localOptions = ref(loadLocalOptions())
export const allUsers = ref(loadAllUsers())
export function reloadAllUsers() {
    allUsers.value = loadAllUsers()
}
useAutoSave(currentUser, store, options)
watch(localOptions, (options) => {
    set('localopt', options)
})
