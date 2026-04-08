//
//  ClickyDesktopSessionStore.swift
//  leanring-buddy
//
//  Stores the Better Auth bearer token used by the desktop app.
//

import Foundation
import Security

enum ClickyDesktopSessionStore {
    private static let keychainService = "so.clicky.desktop"
    private static let keychainAccount = "better-auth-bearer-token"

    static func loadBearerToken() -> String? {
        let query: [String: Any] = [
            kSecClass as String: kSecClassGenericPassword,
            kSecAttrService as String: keychainService,
            kSecAttrAccount as String: keychainAccount,
            kSecReturnData as String: true,
            kSecMatchLimit as String: kSecMatchLimitOne
        ]

        var result: CFTypeRef?
        let status = SecItemCopyMatching(query as CFDictionary, &result)

        guard status == errSecSuccess,
              let tokenData = result as? Data,
              let token = String(data: tokenData, encoding: .utf8),
              !token.isEmpty else {
            return nil
        }

        return token
    }

    static func saveBearerToken(_ bearerToken: String) {
        let tokenData = Data(bearerToken.utf8)

        let query: [String: Any] = [
            kSecClass as String: kSecClassGenericPassword,
            kSecAttrService as String: keychainService,
            kSecAttrAccount as String: keychainAccount
        ]

        let attributes: [String: Any] = [
            kSecValueData as String: tokenData
        ]

        let updateStatus = SecItemUpdate(query as CFDictionary, attributes as CFDictionary)

        if updateStatus == errSecSuccess {
            return
        }

        guard updateStatus == errSecItemNotFound else {
            return
        }

        let insertQuery: [String: Any] = query.merging(attributes) { _, newValue in
            newValue
        }

        SecItemAdd(insertQuery as CFDictionary, nil)
    }

    static func clearBearerToken() {
        let query: [String: Any] = [
            kSecClass as String: kSecClassGenericPassword,
            kSecAttrService as String: keychainService,
            kSecAttrAccount as String: keychainAccount
        ]

        SecItemDelete(query as CFDictionary)
    }

    static func authorizationHeaderValue() -> String? {
        guard let bearerToken = loadBearerToken() else {
            return nil
        }

        return "Bearer \(bearerToken)"
    }
}
