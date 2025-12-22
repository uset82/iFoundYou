import Foundation
import MultipeerConnectivity
import React

@objc(IfoundYouMultipeer)
class IfoundYouMultipeer: RCTEventEmitter {
  private let serviceType = "ify-mesh"
  private var peerID: MCPeerID?
  private var session: MCSession?
  private var advertiser: MCNearbyServiceAdvertiser?
  private var browser: MCNearbyServiceBrowser?
  private var isActive = false

  override static func requiresMainQueueSetup() -> Bool {
    return true
  }

  override func supportedEvents() -> [String]! {
    return ["MultipeerPeerUpdate", "MultipeerMessage", "MultipeerError"]
  }

  @objc(startSession:resolver:rejecter:)
  func startSession(
    _ displayName: NSString?,
    resolver resolve: RCTPromiseResolveBlock,
    rejecter reject: RCTPromiseRejectBlock
  ) {
    if isActive {
      resolve(true)
      return
    }

    let trimmed = (displayName as String?)?.trimmingCharacters(in: .whitespacesAndNewlines)
    let name = (trimmed?.isEmpty == false) ? trimmed! : UIDevice.current.name

    let peerID = MCPeerID(displayName: name)
    let session = MCSession(peer: peerID, securityIdentity: nil, encryptionPreference: .required)
    session.delegate = self

    let advertiser = MCNearbyServiceAdvertiser(peer: peerID, discoveryInfo: nil, serviceType: serviceType)
    advertiser.delegate = self

    let browser = MCNearbyServiceBrowser(peer: peerID, serviceType: serviceType)
    browser.delegate = self

    self.peerID = peerID
    self.session = session
    self.advertiser = advertiser
    self.browser = browser
    self.isActive = true

    advertiser.startAdvertisingPeer()
    browser.startBrowsingForPeers()

    sendPeerUpdate()
    resolve(true)
  }

  @objc(stopSession:rejecter:)
  func stopSession(
    _ resolve: RCTPromiseResolveBlock,
    rejecter reject: RCTPromiseRejectBlock
  ) {
    advertiser?.stopAdvertisingPeer()
    browser?.stopBrowsingForPeers()
    session?.disconnect()

    advertiser = nil
    browser = nil
    session = nil
    peerID = nil
    isActive = false

    sendPeerUpdate()
    resolve(true)
  }

  @objc(sendMessage:resolver:rejecter:)
  func sendMessage(
    _ message: NSString,
    resolver resolve: RCTPromiseResolveBlock,
    rejecter reject: RCTPromiseRejectBlock
  ) {
    guard let session = session else {
      reject("no_session", "Session not started.", nil)
      return
    }

    let peers = session.connectedPeers
    if peers.isEmpty {
      resolve(false)
      return
    }

    guard let data = (message as String).data(using: .utf8) else {
      reject("encode_error", "Unable to encode message.", nil)
      return
    }

    do {
      try session.send(data, toPeers: peers, with: .reliable)
      resolve(true)
    } catch {
      reject("send_error", error.localizedDescription, error)
    }
  }

  private func sendPeerUpdate() {
    let peers = session?.connectedPeers.map { $0.displayName } ?? []
    sendEvent(withName: "MultipeerPeerUpdate", body: ["peers": peers])
  }

  private func sendError(_ message: String) {
    sendEvent(withName: "MultipeerError", body: ["message": message])
  }
}

extension IfoundYouMultipeer: MCNearbyServiceAdvertiserDelegate {
  func advertiser(
    _ advertiser: MCNearbyServiceAdvertiser,
    didReceiveInvitationFromPeer peerID: MCPeerID,
    withContext context: Data?,
    invitationHandler: @escaping (Bool, MCSession?) -> Void
  ) {
    invitationHandler(true, session)
  }

  func advertiser(
    _ advertiser: MCNearbyServiceAdvertiser,
    didNotStartAdvertisingPeer error: Error
  ) {
    sendError(error.localizedDescription)
  }
}

extension IfoundYouMultipeer: MCNearbyServiceBrowserDelegate {
  func browser(
    _ browser: MCNearbyServiceBrowser,
    foundPeer peerID: MCPeerID,
    withDiscoveryInfo info: [String : String]?
  ) {
    guard let session = session else { return }
    browser.invitePeer(peerID, to: session, withContext: nil, timeout: 10)
  }

  func browser(
    _ browser: MCNearbyServiceBrowser,
    lostPeer peerID: MCPeerID
  ) {
    sendPeerUpdate()
  }

  func browser(
    _ browser: MCNearbyServiceBrowser,
    didNotStartBrowsingForPeers error: Error
  ) {
    sendError(error.localizedDescription)
  }
}

extension IfoundYouMultipeer: MCSessionDelegate {
  func session(_ session: MCSession, peer peerID: MCPeerID, didChange state: MCSessionState) {
    sendPeerUpdate()
  }

  func session(_ session: MCSession, didReceive data: Data, fromPeer peerID: MCPeerID) {
    guard let message = String(data: data, encoding: .utf8) else { return }
    sendEvent(withName: "MultipeerMessage", body: ["from": peerID.displayName, "message": message])
  }

  func session(
    _ session: MCSession,
    didReceive stream: InputStream,
    withName streamName: String,
    fromPeer peerID: MCPeerID
  ) {}

  func session(
    _ session: MCSession,
    didStartReceivingResourceWithName resourceName: String,
    fromPeer peerID: MCPeerID,
    with progress: Progress
  ) {}

  func session(
    _ session: MCSession,
    didFinishReceivingResourceWithName resourceName: String,
    fromPeer peerID: MCPeerID,
    at localURL: URL?,
    withError error: Error?
  ) {}
}
