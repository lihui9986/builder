import { createStore, compose, applyMiddleware } from 'redux'
import { routerMiddleware } from 'connected-react-router'
import createSagasMiddleware from 'redux-saga'
import { createLogger } from 'redux-logger'
import { createBrowserHistory } from 'history'
import { BuilderClient } from '@dcl/builder-client'

import { CatalystClient } from 'dcl-catalyst-client'
import { config } from 'config'
import { DataByKey } from 'decentraland-dapps/dist/lib/types'
import { createTransactionMiddleware } from 'decentraland-dapps/dist/modules/transaction/middleware'
import { createStorageMiddleware } from 'decentraland-dapps/dist/modules/storage/middleware'
import { createAnalyticsMiddleware } from 'decentraland-dapps/dist/modules/analytics/middleware'
import { configure as configureAnalytics } from 'decentraland-dapps/dist/modules/analytics/utils'
import { getOpenModals } from 'decentraland-dapps/dist/modules/modal/selectors'
import { openModal } from 'decentraland-dapps/dist/modules/modal/actions'
import { getAddress } from 'decentraland-dapps/dist/modules/wallet/selectors'

import { PROVISION_SCENE, CREATE_SCENE } from 'modules/scene/actions'
import { DEPLOY_TO_LAND_SUCCESS, CLEAR_DEPLOYMENT_SUCCESS } from 'modules/deployment/actions'
import { SET_PROJECT, DELETE_PROJECT, CREATE_PROJECT, EDIT_PROJECT_THUMBNAIL } from 'modules/project/actions'
import { SAVE_PROJECT_SUCCESS } from 'modules/sync/actions'
import { EDITOR_UNDO, EDITOR_REDO } from 'modules/editor/actions'
import { Project } from 'modules/project/types'
import { migrations } from 'modules/migrations/store'
import { getData } from 'modules/identity/selectors'
import { Scene } from 'modules/scene/types'
import { getLoadingSet } from 'modules/sync/selectors'
import { DISMISS_SIGN_IN_TOAST, DISMISS_SYNCED_TOAST, SET_SYNC } from 'modules/ui/dashboard/actions'
import { GENERATE_IDENTITY_SUCCESS, DESTROY_IDENTITY, LOGIN_SUCCESS, LOGIN_FAILURE } from 'modules/identity/actions'
import { fetchTilesRequest } from 'modules/tile/actions'
import { isDevelopment } from 'lib/environment'
import { BuilderAPI, BUILDER_SERVER_URL } from 'lib/api/builder'
import { Authorization } from 'lib/api/auth'
import { PEER_URL } from 'lib/api/peer'
import { createRootReducer } from './reducer'
import { rootSaga } from './sagas'
import { RootState, RootStore } from './types'

// eslint-disable-next-line @typescript-eslint/no-var-requires
const builderVersion = require('../../../package.json').version

configureAnalytics({
  transformPayload: payload => {
    if (typeof payload === 'string' || payload === undefined) return payload
    return { ...payload, version: builderVersion }
  }
})

// eslint-disable-next-line @typescript-eslint/ban-ts-comment
// @ts-ignore: Dev tools
const composeEnhancers = window.__REDUX_DEVTOOLS_EXTENSION_COMPOSE__
  ? // prettier-ignore
    (window as any).__REDUX_DEVTOOLS_EXTENSION_COMPOSE__({
    stateSanitizer: (state: RootState) => {
      const { scene: _, ...newState } = state
      return newState
    }
  })
  : compose

const history = createBrowserHistory()
const rootReducer = createRootReducer(history)

const historyMiddleware = routerMiddleware(history)
const sagasMiddleware = createSagasMiddleware()
const loggerMiddleware = createLogger({
  predicate: () => isDevelopment,
  collapsed: () => true
})
const { storageMiddleware, loadStorageMiddleware } = createStorageMiddleware({
  migrations,
  storageKey: config.get('LOCAL_STORAGE_KEY', 'builder'),
  paths: [
    ['project', 'data'],
    ['scene', 'present'],
    ['ui', 'dashboard'],
    ['auth', 'data'],
    ['sync', 'localProjectIds'],
    ['identity', 'data']
  ],
  actions: [
    CREATE_PROJECT,
    SET_PROJECT,
    CREATE_SCENE,
    PROVISION_SCENE,
    EDITOR_UNDO,
    EDITOR_REDO,
    DELETE_PROJECT,
    DEPLOY_TO_LAND_SUCCESS,
    CLEAR_DEPLOYMENT_SUCCESS,
    LOGIN_SUCCESS,
    LOGIN_FAILURE,
    SAVE_PROJECT_SUCCESS,
    EDIT_PROJECT_THUMBNAIL,
    DISMISS_SIGN_IN_TOAST,
    DISMISS_SYNCED_TOAST,
    SET_SYNC,
    GENERATE_IDENTITY_SUCCESS,
    DESTROY_IDENTITY
  ],
  transform: state => {
    const projects: DataByKey<Project> = {}
    const scene: DataByKey<Scene> = {}

    for (const id of state.sync.project.localIds) {
      const project = state.project.data[id]
      if (!project) continue
      projects[id] = project
      scene[project.sceneId] = state.scene.present.data[project.sceneId]
    }

    const newState: RootState = {
      ...state,
      project: {
        ...state.project,
        data: projects
      },
      scene: {
        ...state.scene,
        present: {
          ...state.scene.present,
          data: scene
        }
      }
    }

    return newState
  },
  onError: (err, store) => {
    const isQuotaModalOpen = !!getOpenModals(store.getState())['QuotaExceededModal']
    if (err instanceof DOMException && err.name === 'QuotaExceededError' && !isQuotaModalOpen) {
      store.dispatch(openModal('QuotaExceededModal'))
    }
  }
})
const transactionMiddleware = createTransactionMiddleware()
const analyticsMiddleware = createAnalyticsMiddleware(config.get('SEGMENT_API_KEY'))

const middlewares = [historyMiddleware, sagasMiddleware, loggerMiddleware, storageMiddleware, analyticsMiddleware, transactionMiddleware]

const middleware = applyMiddleware(...middlewares)

const enhancer = composeEnhancers(middleware)
const store = createStore(rootReducer, enhancer) as RootStore

const builderAPI = new BuilderAPI(BUILDER_SERVER_URL, new Authorization(store))
const catalystClient = new CatalystClient({ catalystUrl: PEER_URL })

const getClientAddress = () => getAddress(store.getState())!
const getClientAuthAuthority = () => {
  const auths = getData(store.getState())
  const address = getAddress(store.getState())
  return auths[address!]
}

// As the builder client manages by itself the version of the API, we need to remove it from
// the environment variable that we're using to with the older client.
const builderClientUrl: string = BUILDER_SERVER_URL.replace('/v1', '')

const newBuilderClient = new BuilderClient(builderClientUrl, getClientAuthAuthority, getClientAddress, fetch)

sagasMiddleware.run(rootSaga, builderAPI, newBuilderClient, catalystClient)
loadStorageMiddleware(store)

if (isDevelopment) {
  const _window = window as any
  // eslint-disable-next-line @typescript-eslint/unbound-method
  _window.getState = store.getState
}

window.onbeforeunload = function () {
  const syncCount = getLoadingSet(store.getState()).size
  return syncCount > 0 || null
}

store.dispatch(fetchTilesRequest())

export { store, history }
