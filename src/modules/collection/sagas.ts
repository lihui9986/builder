import PQueue from 'p-queue'
import equal from 'fast-deep-equal'
import { Contract, providers, constants, ethers } from 'ethers'
import { push, replace } from 'connected-react-router'
import { select, take, takeEvery, call, put, takeLatest, race, retry, delay } from 'redux-saga/effects'
import { CatalystClient, DeploymentPreparationData } from 'dcl-catalyst-client'
import { ChainId } from '@dcl/schemas'
import { generateTree } from '@dcl/content-hash-tree'
import { BuilderClient, ThirdParty } from '@dcl/builder-client'
import { ContractData, ContractName, getContract } from 'decentraland-transactions'
import { getOpenModals } from 'decentraland-dapps/dist/modules/modal/selectors'
import { ModalState } from 'decentraland-dapps/dist/modules/modal/reducer'
import { t } from 'decentraland-dapps/dist/modules/translation/utils'
import { FetchTransactionSuccessAction, FETCH_TRANSACTION_SUCCESS } from 'decentraland-dapps/dist/modules/transaction/actions'
import { Provider, Wallet } from 'decentraland-dapps/dist/modules/wallet/types'
import { getAddress } from 'decentraland-dapps/dist/modules/wallet/selectors'
import { sendTransaction } from 'decentraland-dapps/dist/modules/wallet/utils'
import { getChainIdByNetwork, getNetworkProvider } from 'decentraland-dapps/dist/lib/eth'
import { Network } from '@dcl/schemas'
import {
  FetchCollectionsRequestAction,
  fetchCollectionsSuccess,
  fetchCollectionsFailure,
  FETCH_COLLECTIONS_REQUEST,
  FETCH_COLLECTIONS_SUCCESS,
  FetchCollectionRequestAction,
  fetchCollectionSuccess,
  fetchCollectionFailure,
  FETCH_COLLECTION_REQUEST,
  SaveCollectionRequestAction,
  saveCollectionSuccess,
  saveCollectionFailure,
  SAVE_COLLECTION_REQUEST,
  DeleteCollectionRequestAction,
  deleteCollectionSuccess,
  deleteCollectionFailure,
  DELETE_COLLECTION_REQUEST,
  PublishCollectionRequestAction,
  publishCollectionSuccess,
  publishCollectionFailure,
  PUBLISH_COLLECTION_REQUEST,
  SetCollectionMintersRequestAction,
  setCollectionMintersSuccess,
  setCollectionMintersFailure,
  SET_COLLECTION_MINTERS_REQUEST,
  SetCollectionManagersRequestAction,
  setCollectionManagersSuccess,
  setCollectionManagersFailure,
  SET_COLLECTION_MANAGERS_REQUEST,
  MintCollectionItemsRequestAction,
  mintCollectionItemsSuccess,
  mintCollectionItemsFailure,
  MINT_COLLECTION_ITEMS_REQUEST,
  ApproveCollectionRequestAction,
  approveCollectionSuccess,
  approveCollectionFailure,
  APPROVE_COLLECTION_REQUEST,
  RejectCollectionRequestAction,
  rejectCollectionSuccess,
  rejectCollectionFailure,
  REJECT_COLLECTION_REQUEST,
  PUBLISH_COLLECTION_SUCCESS,
  saveCollectionRequest,
  SAVE_COLLECTION_SUCCESS,
  SAVE_COLLECTION_FAILURE,
  SaveCollectionFailureAction,
  SaveCollectionSuccessAction,
  INITIATE_APPROVAL_FLOW,
  InitiateApprovalFlowAction,
  APPROVE_COLLECTION_SUCCESS,
  APPROVE_COLLECTION_FAILURE,
  ApproveCollectionSuccessAction,
  ApproveCollectionFailureAction,
  InitiateTPApprovalFlowAction,
  INITIATE_TP_APPROVAL_FLOW
} from './actions'
import { getMethodData, getWallet } from 'modules/wallet/utils'
import { buildCollectionForumPost } from 'modules/forum/utils'
import { createCollectionForumPostRequest } from 'modules/forum/actions'
import {
  setItemsTokenIdRequest,
  FETCH_ITEMS_SUCCESS,
  SAVE_ITEM_SUCCESS,
  SaveItemSuccessAction,
  RESCUE_ITEMS_SUCCESS,
  RESCUE_ITEMS_FAILURE,
  RescueItemsSuccessAction,
  RescueItemsFailureAction,
  fetchCollectionItemsRequest,
  FETCH_COLLECTION_ITEMS_SUCCESS,
  FETCH_COLLECTION_ITEMS_FAILURE,
  SAVE_MULTIPLE_ITEMS_SUCCESS,
  SaveMultipleItemsSuccessAction,
  saveItemRequest,
  SAVE_ITEM_FAILURE,
  SET_ITEMS_TOKEN_ID_SUCCESS,
  FetchCollectionItemsSuccessAction
} from 'modules/item/actions'
import { areSynced, isValidText, toInitializeItems } from 'modules/item/utils'
import { locations } from 'routing/locations'
import { getCollectionId } from 'modules/location/selectors'
import { BuilderAPI, FetchCollectionsParams } from 'lib/api/builder'
import { getArrayOfPagesFromTotal, PaginatedResource } from 'lib/api/pagination'
import { extractThirdPartyId } from 'lib/urn'
import { closeModal, CloseModalAction, CLOSE_MODAL, openModal } from 'modules/modal/actions'
import { EntityHashingType, isEmoteItemType, Item, ItemApprovalData } from 'modules/item/types'
import { Slot } from 'modules/thirdParty/types'
import {
  getEntityByItemId,
  getItems,
  getCollectionItems,
  getWalletItems,
  getData as getItemsById,
  getPaginationData as getItemPaginationData
} from 'modules/item/selectors'
import { getName } from 'modules/profile/selectors'
import { buildItemEntity, buildStandardWearableContentHash, hasOldHashedContents } from 'modules/item/export'
import { getCurationsByCollectionId } from 'modules/curations/collectionCuration/selectors'
import {
  ApproveCollectionCurationFailureAction,
  approveCollectionCurationRequest,
  ApproveCollectionCurationSuccessAction,
  APPROVE_COLLECTION_CURATION_FAILURE,
  APPROVE_COLLECTION_CURATION_SUCCESS
} from 'modules/curations/collectionCuration/actions'
import { CollectionCuration } from 'modules/curations/collectionCuration/types'
import { CurationStatus } from 'modules/curations/types'
import {
  DeployBatchedThirdPartyItemsFailureAction,
  DeployBatchedThirdPartyItemsSuccessAction,
  DEPLOY_BATCHED_THIRD_PARTY_ITEMS_FAILURE,
  DEPLOY_BATCHED_THIRD_PARTY_ITEMS_SUCCESS,
  ReviewThirdPartyFailureAction,
  REVIEW_THIRD_PARTY_FAILURE,
  REVIEW_THIRD_PARTY_SUCCESS
} from 'modules/thirdParty/actions'
import {
  DeployEntitiesFailureAction,
  DeployEntitiesSuccessAction,
  DEPLOY_ENTITIES_FAILURE,
  DEPLOY_ENTITIES_SUCCESS
} from 'modules/entity/actions'
import { ApprovalFlowModalMetadata, ApprovalFlowModalView } from 'components/Modals/ApprovalFlowModal/ApprovalFlowModal.types'
import { getCollection, getData, getLastFetchParams, getPaginationData, getRaritiesContract, getWalletCollections } from './selectors'
import { CollectionPaginationData } from './reducer'
import { Collection, CollectionType } from './types'
import {
  isOwner,
  getCollectionBaseURI,
  getCollectionSymbol,
  isLocked,
  getCollectionType,
  UNSYNCED_COLLECTION_ERROR_PREFIX,
  isTPCollection,
  getCollectionFactoryContract,
  toPaginationStats
} from './utils'

const THIRD_PARTY_MERKLE_ROOT_CHECK_MAX_RETRIES = 160

export function* collectionSaga(legacyBuilderClient: BuilderAPI, client: BuilderClient, catalyst: CatalystClient) {
  yield takeEvery(FETCH_COLLECTIONS_REQUEST, handleFetchCollectionsRequest)
  yield takeEvery(FETCH_COLLECTION_REQUEST, handleFetchCollectionRequest)
  yield takeLatest(FETCH_COLLECTIONS_SUCCESS, handleRequestCollectionSuccess)
  yield takeEvery(FETCH_COLLECTION_ITEMS_SUCCESS, handleFetchCollectionItemsSuccess)
  yield takeEvery(SAVE_COLLECTION_REQUEST, handleSaveCollectionRequest)
  yield takeLatest(SAVE_COLLECTION_SUCCESS, handleSaveCollectionSuccess)
  yield takeLatest(SAVE_ITEM_SUCCESS, handleSaveItemSuccess)
  yield takeLatest(SAVE_MULTIPLE_ITEMS_SUCCESS, handleSaveMultipleItemsSuccess)
  yield takeEvery(DELETE_COLLECTION_REQUEST, handleDeleteCollectionRequest)
  yield takeEvery(PUBLISH_COLLECTION_REQUEST, handlePublishCollectionRequest)
  yield takeEvery(SET_COLLECTION_MINTERS_REQUEST, handleSetCollectionMintersRequest)
  yield takeEvery(SET_COLLECTION_MANAGERS_REQUEST, handleSetCollectionManagersRequest)
  yield takeEvery(MINT_COLLECTION_ITEMS_REQUEST, handleMintCollectionItemsRequest)
  yield takeEvery(APPROVE_COLLECTION_REQUEST, handleApproveCollectionRequest)
  yield takeEvery(REJECT_COLLECTION_REQUEST, handleRejectCollectionRequest)
  yield takeLatest(FETCH_TRANSACTION_SUCCESS, handleTransactionSuccess)
  yield takeLatest(INITIATE_APPROVAL_FLOW, handleInitiateApprovalFlow)
  yield takeLatest(INITIATE_TP_APPROVAL_FLOW, handleInitiateTPItemsApprovalFlow)

  function isPaginated(response: PaginatedResource<Collection> | Collection[]): response is PaginatedResource<Collection> {
    return (response as PaginatedResource<Collection>).results !== undefined
  }

  function* handleFetchCollectionsRequest(action: FetchCollectionsRequestAction) {
    const { address, params, useCachedResults } = action.payload
    try {
      if (useCachedResults) {
        const lastFetchParams: FetchCollectionsParams | undefined = yield select(getLastFetchParams)
        if (equal(params, lastFetchParams)) {
          const collections: Record<string, Collection> = yield select(getData)
          const paginationData: CollectionPaginationData | null = yield select(getPaginationData)
          yield put(
            fetchCollectionsSuccess(Object.values(collections), paginationData ? toPaginationStats(paginationData) : undefined, params)
          )
          return
        }
      }
      const response: PaginatedResource<Collection> | Collection[] = yield call([legacyBuilderClient, 'fetchCollections'], address, params)
      if (isPaginated(response)) {
        const { results, limit, page, pages, total } = response
        yield put(
          fetchCollectionsSuccess(
            results,
            {
              limit,
              page,
              pages,
              total
            },
            params
          )
        )
      } else {
        yield put(fetchCollectionsSuccess(response, undefined, params))
      }
    } catch (error) {
      yield put(fetchCollectionsFailure(error.message))
    }
  }

  function* handleFetchCollectionRequest(action: FetchCollectionRequestAction) {
    const { id } = action.payload
    try {
      const collection: Collection = yield call([legacyBuilderClient, 'fetchCollection'], id)
      yield put(fetchCollectionSuccess(id, collection))
    } catch (error) {
      yield put(fetchCollectionFailure(id, error.message))
    }
  }

  function* handleSaveCollectionSuccess(action: SaveCollectionSuccessAction) {
    const openModals: ModalState = yield select(getOpenModals)

    if (openModals['CreateCollectionModal'] || openModals['CreateThirdPartyCollectionModal']) {
      // Redirect to the newly created collection detail
      const { collection } = action.payload
      const detailPageLocation = isTPCollection(collection) ? locations.thirdPartyCollectionDetail : locations.collectionDetail
      yield put(push(detailPageLocation(collection.id)))
    }

    // Close corresponding modals
    yield put(closeModal('CreateCollectionModal'))
    yield put(closeModal('CreateThirdPartyCollectionModal'))
    yield put(closeModal('EditCollectionURNModal'))
    yield put(closeModal('EditCollectionNameModal'))
  }

  function* handleSaveItemSuccess(action: SaveItemSuccessAction) {
    const { item } = action.payload
    if (item.collectionId && !item.isPublished) {
      const collection: Collection = yield select(getCollection, item.collectionId)
      yield put(saveCollectionRequest(collection))
    }
  }

  function* handleSaveMultipleItemsSuccess(action: SaveMultipleItemsSuccessAction) {
    const { items } = action.payload
    if (items.length > 0 && items[0].collectionId) {
      const collection: Collection = yield select(getCollection, items[0].collectionId)
      yield put(saveCollectionRequest(collection))
    }
  }

  function* handleSaveCollectionRequest(action: SaveCollectionRequestAction) {
    const { collection } = action.payload
    try {
      if (!isValidText(collection.name)) {
        throw new Error(yield call(t, 'sagas.collection.invalid_character'))
      }
      if (isLocked(collection)) {
        throw new Error(yield call(t, 'sagas.collection.collection_locked'))
      }

      let data = ''

      if (getCollectionType(collection) === CollectionType.STANDARD) {
        const items: Item[] = yield select(state => getCollectionItems(state, collection.id))
        const from: string = yield select(getAddress)
        const maticChainId = getChainIdByNetwork(Network.MATIC)
        const rarities: ContractData = getRaritiesContract(maticChainId)
        const { abi } = getContract(ContractName.ERC721CollectionV2, maticChainId)

        const provider: Provider = yield call(getNetworkProvider, maticChainId)
        const collectionV2 = new Contract(
          constants.AddressZero, // using zero address here since we just want the implementation of the ERC721CollectionV2 to generate the `data` of the initialize method
          abi,
          new providers.Web3Provider(provider)
        )
        data = yield call(
          getMethodData,
          collectionV2.populateTransaction.initialize(
            collection.name,
            getCollectionSymbol(collection),
            getCollectionBaseURI(),
            from,
            true, // should complete
            false, // is approved
            rarities.address,
            toInitializeItems(items)
          )
        )
      }

      const remoteCollection: Collection = yield call([legacyBuilderClient, 'saveCollection'], collection, data)
      const newCollection = { ...collection, ...remoteCollection }

      yield put(saveCollectionSuccess(newCollection))
    } catch (error) {
      yield put(saveCollectionFailure(collection, error.message))
    }
  }

  function* handleDeleteCollectionRequest(action: DeleteCollectionRequestAction) {
    const { collection } = action.payload
    try {
      yield call(() => legacyBuilderClient.deleteCollection(collection.id))
      yield put(deleteCollectionSuccess(collection))

      const collectionIdInUriParam: string = yield select(getCollectionId)
      if (collectionIdInUriParam === collection.id) {
        yield put(replace(locations.collections()))
      }
    } catch (error) {
      yield put(deleteCollectionFailure(collection, error.message))
    }
  }

  function* handlePublishCollectionRequest(action: PublishCollectionRequestAction) {
    const { items, email } = action.payload
    let { collection } = action.payload
    try {
      if (!isLocked(collection)) {
        // To ensure the contract address of the collection is correct, we pre-emptively save it to the server and store the response.
        // This will re-generate the address and any other data generated on the server (like the salt) before actually publishing it.
        // We skip this step if the collection is locked to avoid an error from the server while trying to save the collection
        yield put(saveCollectionRequest(collection))

        const saveCollection: {
          success: SaveCollectionSuccessAction
          failure: SaveCollectionFailureAction
        } = yield race({
          success: take(SAVE_COLLECTION_SUCCESS),
          failure: take(SAVE_COLLECTION_FAILURE)
        })

        if (saveCollection.success) {
          collection = saveCollection.success.payload.collection
        } else {
          throw new Error(saveCollection.failure.payload.error)
        }
      }

      if (!collection.salt) {
        throw new Error(yield call(t, 'sagas.item.missing_salt'))
      }

      // Check that items currently in the builder match the items the user wants to publish
      // This will solve the issue were users could add items in different tabs and not see them in the tab
      // were the publish is being made, leaving the collection in a corrupted state.
      const serverItems: Item[] = yield call([legacyBuilderClient, 'fetchCollectionItems'], collection.id)

      if (serverItems.length !== items.length) {
        throw new Error(`${UNSYNCED_COLLECTION_ERROR_PREFIX} Different items length`)
      }

      // TODO: Deeper comparison of browser and server items. Compare metadata for example.
      serverItems.forEach(serverItem => {
        const browserItem = items.find(item => item.id === serverItem.id)

        if (!browserItem) {
          throw new Error(`${UNSYNCED_COLLECTION_ERROR_PREFIX} Item found in the server but not in the browser`)
        }
      })

      // Re-save items that are not updated with the latest hash
      for (const item of items) {
        if (hasOldHashedContents(item)) {
          yield put(saveItemRequest(item, {}))

          const saveItem: {
            success: SaveCollectionSuccessAction
            failure: SaveCollectionFailureAction
          } = yield race({
            success: take(SAVE_ITEM_SUCCESS),
            failure: take(SAVE_ITEM_FAILURE)
          })

          if (saveItem.failure) {
            throw new Error(saveItem.failure.payload.error)
          }
        }
      }

      const from: string = yield select(getAddress)
      const maticChainId: ChainId = yield call(getChainIdByNetwork, Network.MATIC)

      const forwarder = getContract(ContractName.Forwarder, maticChainId)
      const factory = getCollectionFactoryContract(maticChainId)
      const manager = getContract(ContractName.CollectionManager, maticChainId)

      // We wait for TOS to end first to avoid locking the collection preemptively if this endpoint fails
      yield retry(10, 500, legacyBuilderClient.saveTOS, collection, email)

      const txHash: string = yield call(sendTransaction, manager, collectionManager =>
        collectionManager.createCollection(
          forwarder.address,
          factory.address,
          collection.salt!,
          collection.name,
          getCollectionSymbol(collection),
          getCollectionBaseURI(),
          from,
          toInitializeItems(items)
        )
      )

      const lock: string = yield retry(10, 500, legacyBuilderClient.lockCollection, collection)
      collection = { ...collection, lock: +new Date(lock) }

      yield put(publishCollectionSuccess(collection, items, maticChainId, txHash))
    } catch (error) {
      yield put(publishCollectionFailure(collection, items, error.message))
    }
  }

  function* handleSetCollectionMintersRequest(action: SetCollectionMintersRequestAction) {
    const { collection, accessList } = action.payload
    try {
      const maticChainId = getChainIdByNetwork(Network.MATIC)

      const addresses: string[] = []
      const values: boolean[] = []

      const newMinters = new Set(collection.minters)

      for (const { address, hasAccess } of accessList) {
        addresses.push(address)
        values.push(hasAccess)

        if (hasAccess) {
          newMinters.add(address)
        } else {
          newMinters.delete(address)
        }
      }

      const contract = { ...getContract(ContractName.ERC721CollectionV2, maticChainId), address: collection.contractAddress! }
      const txHash: string = yield call(sendTransaction, contract, collection => collection.setMinters(addresses, values))

      yield put(setCollectionMintersSuccess(collection, Array.from(newMinters), maticChainId, txHash))
      yield put(replace(locations.activity()))
    } catch (error) {
      yield put(setCollectionMintersFailure(collection, accessList, error.message))
    }
  }

  function* handleSetCollectionManagersRequest(action: SetCollectionManagersRequestAction) {
    const { collection, accessList } = action.payload
    try {
      const maticChainId = getChainIdByNetwork(Network.MATIC)

      const addresses: string[] = []
      const values: boolean[] = []

      const newManagers = new Set(collection.managers)

      for (const { address, hasAccess } of accessList) {
        addresses.push(address)
        values.push(hasAccess)

        if (hasAccess) {
          newManagers.add(address)
        } else {
          newManagers.delete(address)
        }
      }

      const contract = { ...getContract(ContractName.ERC721CollectionV2, maticChainId), address: collection.contractAddress! }
      const txHash: string = yield call(sendTransaction, contract, collection => collection.setManagers(addresses, values))

      yield put(setCollectionManagersSuccess(collection, Array.from(newManagers), maticChainId, txHash))
      yield put(replace(locations.activity()))
    } catch (error) {
      yield put(setCollectionManagersFailure(collection, accessList, error.message))
    }
  }

  function* handleMintCollectionItemsRequest(action: MintCollectionItemsRequestAction) {
    const { collection, mints } = action.payload
    try {
      const maticChainId = getChainIdByNetwork(Network.MATIC)

      const beneficiaries: string[] = []
      const tokenIds: string[] = []

      for (const mint of mints) {
        const beneficiary = mint.address
        for (let i = 0; i < mint.amount; i++) {
          beneficiaries.push(beneficiary)
          tokenIds.push(mint.item.tokenId!)
        }
      }

      const contract = { ...getContract(ContractName.ERC721CollectionV2, maticChainId), address: collection.contractAddress! }
      const txHash: string = yield call(sendTransaction, contract, collection => collection.issueTokens(beneficiaries, tokenIds))

      yield put(mintCollectionItemsSuccess(collection, mints, maticChainId, txHash))
      yield put(closeModal('MintItemsModal'))
      yield put(replace(locations.activity()))
    } catch (error) {
      yield put(mintCollectionItemsFailure(collection, mints, error.message))
    }
  }

  function* handleApproveCollectionRequest(action: ApproveCollectionRequestAction) {
    const { collection } = action.payload
    try {
      const txHash: string = yield changeCollectionStatus(collection, true)
      yield put(approveCollectionSuccess(collection, getChainIdByNetwork(Network.MATIC), txHash))
    } catch (error) {
      yield put(approveCollectionFailure(collection, error.message))
    }
  }

  function* handleRejectCollectionRequest(action: RejectCollectionRequestAction) {
    const { collection } = action.payload
    try {
      const wallet: Wallet = yield getWallet()
      const maticChainId = wallet.networks.MATIC.chainId

      const txHash: string = yield changeCollectionStatus(collection, false)
      yield put(rejectCollectionSuccess(collection, maticChainId, txHash))
    } catch (error) {
      yield put(rejectCollectionFailure(collection, error.message))
    }
  }

  function* handleRequestCollectionSuccess() {
    let allItems: Item[] = yield select(getWalletItems)
    if (allItems.length === 0) {
      yield take(FETCH_ITEMS_SUCCESS)
      allItems = yield select(getWalletItems)
    }

    try {
      const collections: Collection[] = yield select(getWalletCollections)

      for (const collection of collections) {
        if (!collection.isPublished) continue
        yield finishCollectionPublishing(collection)
      }
    } catch (error) {
      console.error(error)
    }
  }

  function* handleTransactionSuccess(action: FetchTransactionSuccessAction) {
    const transaction = action.payload.transaction

    try {
      switch (transaction.actionType) {
        case PUBLISH_COLLECTION_SUCCESS: {
          // We re-fetch the collection from the store to get the updated version
          const collectionId = transaction.payload.collection.id
          const collection: Collection = yield select(state => getCollection(state, collectionId))
          yield finishCollectionPublishing(collection)
          break
        }
        default: {
          break
        }
      }
    } catch (error) {
      console.error(error)
    }
  }

  function* handleFetchCollectionItemsSuccess(action: FetchCollectionItemsSuccessAction) {
    const { paginationIndex: collectionId } = action.payload
    try {
      const collection: Collection = yield select(getCollection, collectionId)
      if (collection.isPublished) {
        yield finishCollectionPublishing(collection)
      }
    } catch (error) {
      console.error(error)
    }
  }

  /**
   * Processes a collection that was published to the blockchain by signaling the
   * builder server that the collection has been published, setting the item ids,
   * deploys the item entities to the Catalyst server and creates the forum post.
   *
   * @param collection - The collection to post process.
   */
  function* finishCollectionPublishing(collection: Collection) {
    const avatarName: string | null = yield select(getName)
    const items: Item[] = yield select(getCollectionItems, collection.id)

    yield publishCollection(collection, items)

    if (!collection.forumLink) {
      yield put(createCollectionForumPostRequest(collection, buildCollectionForumPost(collection, items, avatarName || '')))
    }
  }

  /**
   * Publishes a collection, establishing ids for the items and their blockchain ids.
   *
   * @param collection - The collection that owns the items to be set as published.
   * @param items - The items to be set as published.
   */
  function* publishCollection(collection: Collection, items: Item[]) {
    const address: string | undefined = yield select(getAddress)
    if (!isOwner(collection, address)) {
      return
    }

    if (items.some(item => !item.tokenId)) {
      yield put(setItemsTokenIdRequest(collection, items))
    }
  }

  function* changeCollectionStatus(collection: Collection, isApproved: boolean) {
    const maticChainId = getChainIdByNetwork(Network.MATIC)
    const contract = getContract(ContractName.Committee, maticChainId)

    const { abi } = getContract(ContractName.ERC721CollectionV2, maticChainId)
    const implementation = new Contract(collection.contractAddress!, abi)

    const manager = getContract(ContractName.CollectionManager, maticChainId)
    const forwarder = getContract(ContractName.Forwarder, maticChainId)
    const data: string = yield call(getMethodData, implementation.populateTransaction.setApproved(isApproved))

    const txHash: string = yield call(sendTransaction, contract, committee =>
      committee.manageCollection(manager.address, forwarder.address, collection.contractAddress!, [data])
    )
    return txHash
  }

  function* getItemsFromCollection(collection: Collection) {
    const allItems: Item[] = yield select(getItems)
    return allItems.filter(item => item.collectionId === collection.id)
  }

  function* getStandardItemsAndEntitiesToDeploy(collection: Collection) {
    const itemsToDeploy: Item[] = []
    const entitiesToDeploy: DeploymentPreparationData[] = []
    const entitiesByItemId: ReturnType<typeof getEntityByItemId> = yield select(getEntityByItemId)
    const itemsOfCollection: Item[] = yield getItemsFromCollection(collection)
    for (const item of itemsOfCollection) {
      const deployedEntity = entitiesByItemId[item.id]
      if (!deployedEntity || !areSynced(item, deployedEntity)) {
        const entity: DeploymentPreparationData = yield call(
          buildItemEntity,
          catalyst,
          legacyBuilderClient,
          collection,
          item,
          undefined,
          undefined
        )
        itemsToDeploy.push(item)
        entitiesToDeploy.push(entity)
      }
    }
    return { itemsToDeploy, entitiesToDeploy }
  }

  function* handleInitiateTPItemsApprovalFlow(action: InitiateTPApprovalFlowAction) {
    const { collection } = action.payload

    try {
      // Check if this makes sense or add a check to see if the items to be published are correct.
      if (!collection.isPublished) {
        throw new Error("The collection can't be approved because it's not published")
      }

      // 1. Open modal
      yield put(
        openModal('ApprovalFlowModal', {
          view: ApprovalFlowModalView.LOADING,
          collection
        })
      )

      // 2. Get items to approve & the approval data from the server
      // TODO: Use the builder client. Tracked here: https://github.com/decentraland/builder/issues/1855
      // Get all items to get approved in batches
      const paginatedData: PaginatedResource<Item> = yield select(getItemPaginationData, collection.id)
      const BATCH_SIZE = 50
      const REQUESTS_BATCH_SIZE = 10
      const pages = getArrayOfPagesFromTotal(Math.ceil(paginatedData.total / BATCH_SIZE))
      const queue = new PQueue({ concurrency: REQUESTS_BATCH_SIZE })
      const promisesOfPagesToFetch: (() => Promise<PaginatedResource<Item> | Item[]>)[] = pages.map(
        (page: number) => () =>
          legacyBuilderClient.fetchCollectionItems(collection.id, {
            page,
            limit: BATCH_SIZE,
            status: CurationStatus.PENDING
          })
      ) // TODO: try to convert this to a generator so we can test it's called with the right parameters
      const allItemPages: PaginatedResource<Item>[] = yield queue.addAll(promisesOfPagesToFetch)
      const itemsWithPendingCurations = allItemPages.flatMap(result => result.results)

      if (!itemsWithPendingCurations.length) {
        throw Error('Error fetching items to approve')
      }
      const {
        cheque,
        content_hashes: contentHashes,
        chequeWasConsumed,
        root
      }: ItemApprovalData = yield call([legacyBuilderClient, 'fetchApprovalData'], collection.id)

      // 3. Compute the merkle tree root & create slot to consume
      const tree = generateTree(Object.values(contentHashes))
      const amountOfItemsToPublish = itemsWithPendingCurations.filter(item => !item.isApproved).length

      if (cheque.qty < amountOfItemsToPublish) {
        throw Error('Invalid qty of items to approve in the cheque')
      }

      // Open the ApprovalFlowModal with the items to be approved
      // 4. Make the transaction to the contract (update of the merkle tree root with the signature and its parameters)
      if (root !== tree.merkleRoot) {
        const { r, s, v } = ethers.utils.splitSignature(cheque.signature)
        const slot: Slot = {
          qty: cheque.qty,
          salt: cheque.salt,
          sigR: r,
          sigS: s,
          sigV: v
        }

        const modalMetadata: ApprovalFlowModalMetadata<ApprovalFlowModalView.CONSUME_TP_SLOTS> = {
          view: ApprovalFlowModalView.CONSUME_TP_SLOTS,
          items: itemsWithPendingCurations,
          collection,
          merkleTreeRoot: tree.merkleRoot,
          slots: chequeWasConsumed ? [] : [slot]
        }

        yield put(openModal('ApprovalFlowModal', modalMetadata))

        // Wait for actions...
        const { failure, cancel }: { failure: ReviewThirdPartyFailureAction; cancel: CloseModalAction } = yield race({
          success: take(REVIEW_THIRD_PARTY_SUCCESS),
          failure: take(REVIEW_THIRD_PARTY_FAILURE),
          cancel: take(CLOSE_MODAL)
        })

        if (failure) {
          throw new Error(failure.payload.error)
        } else if (cancel) {
          // If cancel exit flow
          return
        }

        // If success wait for tx to be mined
        yield waitForMerkleRootToBeSet(extractThirdPartyId(collection.urn), tree.merkleRoot)
      }

      // 5. If any, open the modal in the DEPLOY step and wait for actions
      if (itemsWithPendingCurations.length > 0) {
        const modalMetadata: ApprovalFlowModalMetadata<ApprovalFlowModalView.DEPLOY_TP> = {
          view: ApprovalFlowModalView.DEPLOY_TP,
          collection,
          tree,
          items: itemsWithPendingCurations,
          hashes: contentHashes
        }

        yield put(openModal('ApprovalFlowModal', modalMetadata))

        // Wait for actions...
        const {
          failure,
          cancel
        }: {
          success: DeployBatchedThirdPartyItemsSuccessAction
          failure: DeployBatchedThirdPartyItemsFailureAction
          cancel: CloseModalAction
        } = yield race({
          success: take(DEPLOY_BATCHED_THIRD_PARTY_ITEMS_SUCCESS),
          failure: take(DEPLOY_BATCHED_THIRD_PARTY_ITEMS_FAILURE),
          cancel: take(CLOSE_MODAL)
        })

        // If failure show error and exit flow
        if (failure) {
          throw new Error(failure.payload.errorMessage)

          // If cancel exit flow
        } else if (cancel) {
          return
        }
      }

      // 7. Success 🎉
      yield put(
        openModal('ApprovalFlowModal', {
          view: ApprovalFlowModalView.SUCCESS,
          collection
        })
      )
    } catch (error) {
      // Handle error at any point in the flow and show them
      const modalMetadata: ApprovalFlowModalMetadata<ApprovalFlowModalView.ERROR> = {
        view: ApprovalFlowModalView.ERROR,
        collection,
        error: error.message
      }
      yield put(openModal('ApprovalFlowModal', modalMetadata))
    }
  }

  function* handleInitiateApprovalFlow(action: InitiateApprovalFlowAction) {
    const { collection } = action.payload

    try {
      if (!collection.isPublished) {
        throw new Error("The collection can't be approved because it's not published")
      }

      // 1. Open modal
      const modalMetadata: ApprovalFlowModalMetadata<ApprovalFlowModalView.LOADING> = {
        view: ApprovalFlowModalView.LOADING,
        collection
      }
      yield put(openModal('ApprovalFlowModal', modalMetadata))

      // 2. Find items that need to be rescued (their content hash needs to be updated)
      const itemsToRescue: Item[] = []
      const contentHashes: string[] = []

      let items: Item[] = yield getItemsFromCollection(collection)

      // Check if any item does not have a tokenId.
      // This might happen because the creator left the browser and never came back after publishing.
      // Meaning that the tokenId could never be set.
      // If the tokenId is never set, curators can't approve the collection.
      // The following code attempts to set the tokenId for items that don't have it in a collection.
      if (items.some(item => !item.tokenId)) {
        // If any item does not have the token id, trigger the action that sets it.
        yield put(setItemsTokenIdRequest(collection, items))

        // Wait until the triggered action emits a success.
        yield take(SET_ITEMS_TOKEN_ID_SUCCESS)

        // Update the items to the new ones with the token id.
        items = yield getItemsFromCollection(collection)
      }

      for (const item of items) {
        // TODO: There's an issue with how hashes are computed in the server for the emotes, force the emotes hashes to be re-computed
        if (!item.currentContentHash || isEmoteItemType(item)) {
          const v0ContentHash: string = yield call(buildStandardWearableContentHash, collection, item, EntityHashingType.V0)
          const v1ContentHash: string = yield call(buildStandardWearableContentHash, collection, item, EntityHashingType.V1)

          // As there could be older hashes in the blockchain, check if both of them are different to see if they need an update
          if (v0ContentHash !== item.blockchainContentHash && v1ContentHash !== item.blockchainContentHash) {
            itemsToRescue.push(item)
            contentHashes.push(v1ContentHash)
          }
        } else if (item.currentContentHash !== item.blockchainContentHash) {
          itemsToRescue.push(item)
          contentHashes.push(item.currentContentHash)
        }
      }

      // 3. If any, open the modal in the rescue step and wait for actions
      if (itemsToRescue.length > 0) {
        const modalMetadata: ApprovalFlowModalMetadata<ApprovalFlowModalView.RESCUE> = {
          view: ApprovalFlowModalView.RESCUE,
          collection,
          items: itemsToRescue,
          contentHashes
        }

        yield put(openModal('ApprovalFlowModal', modalMetadata))

        // Wait for actions...
        const {
          success,
          failure,
          cancel
        }: { success: RescueItemsSuccessAction; failure: RescueItemsFailureAction; cancel: CloseModalAction } = yield race({
          success: take(RESCUE_ITEMS_SUCCESS),
          failure: take(RESCUE_ITEMS_FAILURE),
          cancel: take(CLOSE_MODAL)
        })

        // If success wait for tx to be mined
        if (success) {
          // Wait for contentHashes to be indexed
          yield waitForIndexer(itemsToRescue, contentHashes, collection.id)

          // If failure show error and exit flow
        } else if (failure) {
          throw new Error(failure.payload.error)

          // If cancel exit flow
        } else if (cancel) {
          return
        }
      }

      // 4. Find items that need to be deployed (the content in the catalyst doesn't match their content hash in the blockchain)
      const { itemsToDeploy, entitiesToDeploy }: { itemsToDeploy: Item[]; entitiesToDeploy: DeploymentPreparationData[] } = yield call(
        getStandardItemsAndEntitiesToDeploy,
        collection
      )

      // 5. If any, open the modal in the DEPLOY step and wait for actions
      if (itemsToDeploy.length > 0) {
        const modalMetadata: ApprovalFlowModalMetadata<ApprovalFlowModalView.DEPLOY> = {
          view: ApprovalFlowModalView.DEPLOY,
          collection,
          items: itemsToDeploy,
          entities: entitiesToDeploy
        }
        yield put(openModal('ApprovalFlowModal', modalMetadata))

        // Wait for actions...
        const {
          failure,
          cancel
        }: { success: DeployEntitiesSuccessAction; failure: DeployEntitiesFailureAction; cancel: CloseModalAction } = yield race({
          success: take(DEPLOY_ENTITIES_SUCCESS),
          failure: take(DEPLOY_ENTITIES_FAILURE),
          cancel: take(CLOSE_MODAL)
        })

        // If failure show error and exit flow
        if (failure) {
          throw new Error(failure.payload.error)

          // If cancel exit flow
        } else if (cancel) {
          return
        }
      }

      // 6. If the collection needs to be approved, show the approve modal
      if (!collection.isApproved) {
        const modalMetadata: ApprovalFlowModalMetadata<ApprovalFlowModalView.APPROVE> = { view: ApprovalFlowModalView.APPROVE, collection }
        yield put(openModal('ApprovalFlowModal', modalMetadata))

        // Wait for actions...
        const {
          failure,
          cancel
        }: { success: ApproveCollectionSuccessAction; failure: ApproveCollectionFailureAction; cancel: CloseModalAction } = yield race({
          success: take(APPROVE_COLLECTION_SUCCESS),
          failure: take(APPROVE_COLLECTION_FAILURE),
          cancel: take(CLOSE_MODAL)
        })

        // iI failure show error and exit flow
        if (failure) {
          throw new Error(failure.payload.error)

          // if cancel exit flow
        } else if (cancel) {
          return
        }
      } else {
        // 7. If the collection was approved but it had a pending curation, approve the curation
        const curationsByCollectionId: Record<string, CollectionCuration> = yield select(getCurationsByCollectionId)
        const curation = curationsByCollectionId[collection.id]
        if (curation && curation.status === CurationStatus.PENDING) {
          yield put(approveCollectionCurationRequest(curation.collectionId))

          // wait for actions
          const { failure }: { success: ApproveCollectionCurationSuccessAction; failure: ApproveCollectionCurationFailureAction } =
            yield race({
              success: take(APPROVE_COLLECTION_CURATION_SUCCESS),
              failure: take(APPROVE_COLLECTION_CURATION_FAILURE)
            })

          // if failure show error
          if (failure) {
            const modalMetadata: ApprovalFlowModalMetadata<ApprovalFlowModalView.ERROR> = {
              view: ApprovalFlowModalView.ERROR,
              collection,
              error: failure.payload.error
            }
            yield put(openModal('ApprovalFlowModal', modalMetadata))
            return
          }
        }
      }

      // 8. Success 🎉
      yield put(
        openModal('ApprovalFlowModal', {
          view: ApprovalFlowModalView.SUCCESS,
          collection
        })
      )
    } catch (error) {
      // Handle error at any point in the flow and show them
      const modalMetadata: ApprovalFlowModalMetadata<ApprovalFlowModalView.ERROR> = {
        view: ApprovalFlowModalView.ERROR,
        collection,
        error: error.message
      }
      yield put(openModal('ApprovalFlowModal', modalMetadata))
    }
  }

  function* waitForMerkleRootToBeSet(thirdPartyId: string, merkleRoot: string) {
    for (let i = 0; i < THIRD_PARTY_MERKLE_ROOT_CHECK_MAX_RETRIES; i++) {
      const thirdParty: ThirdParty = yield call([client, 'getThirdParty'], thirdPartyId)
      if (thirdParty.root === merkleRoot) {
        return
      }
      yield delay(1000)
    }
    throw new Error('The Merkle Root was not set in time')
  }

  function* waitForIndexer(items: Item[], contentHashes: string[], collectionId: string) {
    const contentHashByItemId = new Map<string, string>()
    for (let i = 0; i < items.length; i++) {
      contentHashByItemId.set(items[i].id, contentHashes[i])
    }
    let isIndexed = false
    const itemIds = items.map(item => item.id)
    while (!isIndexed) {
      yield delay(1000)
      yield put(fetchCollectionItemsRequest(collectionId))
      yield race({
        success: take(FETCH_COLLECTION_ITEMS_SUCCESS),
        failure: take(FETCH_COLLECTION_ITEMS_FAILURE)
      })
      // use items from state (updated after the fetchItemsSuccess)
      const itemsById: ReturnType<typeof getItemsById> = yield select(getItemsById)
      isIndexed = itemIds.every(id => {
        const indexedContentHash = itemsById[id].blockchainContentHash
        const expectedContentHash = contentHashByItemId.get(id)
        return indexedContentHash === expectedContentHash
      })
    }
  }
}
