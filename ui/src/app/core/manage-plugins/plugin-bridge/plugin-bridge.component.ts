import type { DeviceInfo, PluginSchema } from '@/app/core/manage-plugins/manage-plugins.interfaces'

import { NgClass } from '@angular/common'
import { Component, inject, Input, OnInit } from '@angular/core'
import { FormsModule } from '@angular/forms'
import { Router } from '@angular/router'
import { NgbActiveModal, NgbAlert, NgbModal } from '@ng-bootstrap/ng-bootstrap'
import { TranslatePipe, TranslateService } from '@ngx-translate/core'
import { ToastrService } from 'ngx-toastr'
import { firstValueFrom } from 'rxjs'

import { ApiService } from '@/app/core/api.service'
import { QrcodeComponent } from '@/app/core/components/qrcode/qrcode.component'
import { RestartHomebridgeComponent } from '@/app/core/components/restart-homebridge/restart-homebridge.component'
import { Plugin } from '@/app/core/manage-plugins/manage-plugins.interfaces'
import { ManagePluginsService } from '@/app/core/manage-plugins/manage-plugins.service'
import { SettingsService } from '@/app/core/settings.service'

@Component({
  templateUrl: './plugin-bridge.component.html',
  styleUrls: ['./plugin-bridge.component.scss'],
  standalone: true,
  imports: [
    FormsModule,
    NgbAlert,
    QrcodeComponent,
    NgClass,
    TranslatePipe,
  ],
})
export class PluginBridgeComponent implements OnInit {
  private $activeModal = inject(NgbActiveModal)
  private $api = inject(ApiService)
  private $modal = inject(NgbModal)
  private $plugin = inject(ManagePluginsService)
  private $router = inject(Router)
  private $settings = inject(SettingsService)
  private $toastr = inject(ToastrService)
  private $translate = inject(TranslateService)

  @Input() plugin: Plugin
  @Input() schema: PluginSchema
  @Input() justInstalled = false

  public loading = true
  public canConfigure = true
  public configBlocks: any[] = []
  public selectedBlock: string = '0'
  public isPlatform: boolean
  public enabledBlocks: Record<number, boolean> = {}
  public bridgeCache: Map<number, Record<string, any>> = new Map()
  public originalBridges: any[] = []
  public deviceInfo: Map<string, DeviceInfo | false> = new Map()
  public saveInProgress = false
  public canShowBridgeDebug = false
  public deleteBridges: { id: string, bridgeName: string, paired: boolean }[] = []
  public deletingPairedBridge: boolean = false
  public accessoryBridgeLinks: { index: string, usesIndex: string, name: string, username: string, port: number }[] = []
  public bridgesAvailableForLink: { index: string, usesIndex: string, name: string, username: string, port: number }[] = []
  public currentlySelectedLink: { index: string, usesIndex: string, name: string, username: string, port: number } | null = null
  public currentBridgeHasLinks: boolean = false
  public readonly defaultIcon = 'assets/hb-icon.png'
  public readonly linkChildBridges = '<a href="https://github.com/homebridge/homebridge/wiki/Child-Bridges" target="_blank"><i class="fas fa-external-link-alt primary-text"></i></a>'
  public readonly linkDebug = '<a href="https://github.com/homebridge/homebridge-config-ui-x/wiki/Debug-Common-Values" target="_blank"><i class="fa fa-external-link-alt primary-text"></i></a>'
  public hidePairingAlerts: Set<string> = new Set()

  public async ngOnInit(): Promise<void> {
    await Promise.all([this.getPluginType(), this.loadPluginConfig(), this.loadHidePairingAlerts()])
    this.canShowBridgeDebug = this.$settings.isFeatureEnabled('childBridgeDebugMode')
    this.loading = false
  }

  public handleIconError() {
    this.plugin.icon = this.defaultIcon
  }

  public onBlockChange(index: string) {
    this.selectedBlock = index
    this.currentlySelectedLink = this.accessoryBridgeLinks.find(link => link.index === index) || null
    this.currentBridgeHasLinks = this.accessoryBridgeLinks.some(link => link.usesIndex === index)
    this.bridgesAvailableForLink = []

    // Bridges available for link can only be accessory blocks
    if (this.configBlocks[Number(index)].accessory) {
      for (const [i, bridge] of Array.from(this.bridgeCache.entries())) {
        // Only include bridges that are enabled and not marked for deletion
        if (this.enabledBlocks[i] && !this.deleteBridges.some(b => b.id === bridge.username)) {
          if (i < Number(index)) {
            this.bridgesAvailableForLink.push({
              index: i.toString(),
              usesIndex: index,
              name: bridge.name,
              port: bridge.port,
              username: bridge.username,
            })
          }
        }
      }
    }
  }

  public onLinkBridgeChange(username: string) {
    if (username) {
      // Get the index of the first block in the config with this bridge username
      const index = this.configBlocks.findIndex(block => block._bridge?.username === username)

      // Update the accessoryBridgeLinks
      this.accessoryBridgeLinks.push({
        index: this.selectedBlock,
        usesIndex: index.toString(),
        name: this.bridgeCache.get(index)?.name,
        port: this.bridgeCache.get(index)?.port,
        username,
      })

      // Update currently selected link
      this.currentlySelectedLink = this.accessoryBridgeLinks.find(link => link.index === this.selectedBlock) || null
      this.enabledBlocks[Number(this.selectedBlock)] = true

      // Update this block with the bridge details
      const block = this.configBlocks[Number(this.selectedBlock)]
      block._bridge = {
        username,
      }
    }
  }

  private async getPluginType() {
    try {
      const alias = await firstValueFrom(this.$api.get(`/plugins/alias/${encodeURIComponent(this.plugin.name)}`))
      this.isPlatform = alias.pluginType === 'platform'
    } catch (error) {
      this.$toastr.error(this.$translate.instant('plugins.config.load_error'), this.$translate.instant('toast.title_error'))
      this.$activeModal.close()
      console.error(error)
    }
  }

  private async loadPluginConfig() {
    try {
      this.configBlocks = await firstValueFrom(this.$api.get(`/config-editor/plugin/${encodeURIComponent(this.plugin.name)}`))
      for (const [i, block] of this.configBlocks.entries()) {
        if (block._bridge) {
          this.enabledBlocks[i] = true
        }

        if (block._bridge && block._bridge.username) {
          // For accessory plugin blocks, the username might be the same as a previous block
          const existingBridgeEntry = Array.from(this.bridgeCache.entries()).find(([, bridge]) => bridge.username === block._bridge.username)
          const existingBridgeIndex = existingBridgeEntry ? existingBridgeEntry[0] : -1
          const existingBridge = existingBridgeEntry ? existingBridgeEntry[1] : undefined
          if (existingBridge) {
            block._bridge.env = {}
            this.accessoryBridgeLinks.push({
              index: i.toString(),
              usesIndex: existingBridgeIndex.toString(),
              name: existingBridge.name,
              port: existingBridge.port,
              username: block._bridge.username,
            })
          } else {
            block._bridge.env = block._bridge.env || {}
            this.bridgeCache.set(i, block._bridge)
            await this.getDeviceInfo(block._bridge.username)

            // If the bridge does not have a name in the config, then override it from the pairing
            if (!block._bridge.name) {
              const info = this.deviceInfo.get(block._bridge.username)
              if (info) {
                block._bridge.name = info.displayName
              }
            }
            this.originalBridges.push(block._bridge)
          }
        }
      }

      // If the plugin has just been installed, and there are no existing bridges, enable all blocks
      if (this.justInstalled && this.bridgeCache.size === 0) {
        this.configBlocks.forEach((block, index) => {
          this.enabledBlocks[index] = true
          this.toggleExternalBridge(block, true, index.toString())
        })
      }

      // Check if the currently selected bridge has any links
      const currentBridgeLinks = this.accessoryBridgeLinks.find(link => link.username === this.bridgeCache.get(Number(this.selectedBlock))?.username)
      if (currentBridgeLinks) {
        this.currentBridgeHasLinks = true
      }

      // Initialize the currently selected link
      this.currentlySelectedLink = this.accessoryBridgeLinks.find(link => link.index === this.selectedBlock) || null

      // Initialize bridges available for link
      if (this.configBlocks[Number(this.selectedBlock)]?.accessory) {
        for (const [i, bridge] of Array.from(this.bridgeCache.entries())) {
          if (this.enabledBlocks[i] && !this.deleteBridges.some(b => b.id === bridge.username)) {
            if (i < Number(this.selectedBlock)) {
              this.bridgesAvailableForLink.push({
                index: i.toString(),
                usesIndex: this.selectedBlock,
                name: bridge.name,
                port: bridge.port,
                username: bridge.username,
              })
            }
          }
        }
      }
    } catch (error) {
      this.canConfigure = false
      console.error(error)
    }
  }

  public async toggleExternalBridge(block: any, enable: boolean, index: string) {
    if (enable) {
      const bridgeCache = this.bridgeCache.get(Number(index))

      // Always create HAP bridge configuration when HAP toggle is enabled
      block._bridge = {
        username: bridgeCache ? bridgeCache.username : this.generateUsername(),
        port: await this.getUnusedPort(),
        name: bridgeCache?.name || this.plugin.displayName || this.plugin.name,
        model: bridgeCache?.model,
        manufacturer: bridgeCache?.manufacturer,
        firmwareRevision: bridgeCache?.firmwareRevision,
        debugModeEnabled: bridgeCache?.debugModeEnabled,
        env: bridgeCache?.env || {},
      }

      if (this.deleteBridges.some(b => b.id === block._bridge.username)) {
        this.deleteBridges = this.deleteBridges.filter(b => b.id !== block._bridge.username)
      }

      this.bridgeCache.set(Number(index), block._bridge)
      await this.getDeviceInfo(block._bridge.username)
    } else {
      // Set enabled state to false
      this.enabledBlocks[Number(index)] = false

      // Check for linked bridges
      if (this.accessoryBridgeLinks.some(link => link.index === index)) {
        this.accessoryBridgeLinks = this.accessoryBridgeLinks.filter(link => link.index !== index)
        this.currentlySelectedLink = null
      } else {
        // Store unused child bridge id for deletion, so no bridges are orphaned
        const originalBridge = this.originalBridges.find(b => b.username === block._bridge.username)
        if (originalBridge) {
          // Avoid duplicates
          if (!this.deleteBridges.some(b => b.id === block._bridge.username)) {
            const info = this.deviceInfo.get(block._bridge.username)
            this.deleteBridges.push({
              id: block._bridge.username,
              bridgeName: block._bridge.name || originalBridge.displayName,
              paired: info ? info._isPaired : false,
            })
          }
        }
      }

      delete block._bridge
    }

    // Figure out if we are deleting at least one paired bridge
    this.deletingPairedBridge = this.deleteBridges.some(b => b.paired)
  }

  private async getUnusedPort() {
    try {
      const lookup = await firstValueFrom(this.$api.get('/server/port/new'))
      return lookup.port
    } catch (e) {
      return Math.floor(Math.random() * (60000 - 30000 + 1) + 30000)
    }
  }

  private async getDeviceInfo(username: string) {
    try {
      this.deviceInfo.set(username, await firstValueFrom(this.$api.get(`/server/pairings/${username.replace(/:/g, '')}`)))
    } catch (error) {
      console.error(error)
      this.deviceInfo.set(username, false)
    }
  }

  public getHapNameValidationError(index: string): boolean {
    const block = this.configBlocks[Number(index)]
    if (!block._bridge?.name) {
      return false // Empty is valid
    }

    const name = block._bridge.name
    // HAP name validation: must start and end with letter/number, can contain letters, numbers, spaces, and apostrophes
    // https://github.com/homebridge/HAP-NodeJS/blob/ee41309fd9eac383cdcace39f4f6f6a3d54396f3/src/lib/util/checkName.ts#L12
    const hapNamePattern = /^[\p{L}\p{N}][\p{L}\p{N} ']*[\p{L}\p{N}]$/u
    return !hapNamePattern.test(name)
  }

  public getHapPortValidationError(index: string): boolean {
    const block = this.configBlocks[Number(index)]
    const port = block._bridge?.port

    if (!port && port !== 0) {
      return false // Empty is valid (optional - will be auto-allocated)
    }

    if (typeof port !== 'number' || !Number.isInteger(port) || port < 1025 || port > 65533) {
      return true
    }

    // Check for port conflicts with other enabled bridges
    for (const [i, otherBlock] of this.configBlocks.entries()) {
      if (i.toString() !== index && this.enabledBlocks[i] && otherBlock._bridge?.port === port) {
        return true
      }
    }

    return false
  }

  public async save() {
    this.saveInProgress = true

    try {
      // Validate HAP config before saving
      for (const [index, block] of this.configBlocks.entries()) {
        // HAP validation
        if (block._bridge?.username) {
          if (this.getHapNameValidationError(index.toString())) {
            this.$toastr.error(
              this.$translate.instant('plugins.bridge.name_error'),
              this.$translate.instant('toast.title_error'),
            )
            this.saveInProgress = false
            return
          }

          if (this.getHapPortValidationError(index.toString())) {
            this.$toastr.error(
              this.$translate.instant('plugins.bridge.port_error', {
                type: 'HAP',
              }),
              this.$translate.instant('toast.title_error'),
            )
            this.saveInProgress = false
            return
          }
        }
      }

      await firstValueFrom(this.$api.post(`/config-editor/plugin/${encodeURIComponent(this.plugin.name)}`, this.configBlocks))

      // Delete unused bridges, so no bridges are orphaned
      for (const bridge of this.deleteBridges) {
        try {
          await firstValueFrom(this.$api.delete(`/server/pairings/${bridge.id.replace(/:/g, '')}`))
        } catch (error) {
          console.error(error)
          this.$toastr.error(this.$translate.instant('settings.reset_bridge.error'), this.$translate.instant('toast.title_error'))
        }
      }

      this.$activeModal.close()
      this.$modal.open(RestartHomebridgeComponent, {
        size: 'lg',
        backdrop: 'static',
      })
    } catch (error) {
      console.error(error)
      this.$toastr.error(this.$translate.instant('config.failed_to_save_config'), this.$translate.instant('toast.title_error'))
    } finally {
      this.saveInProgress = false
    }
  }

  public openPluginConfig() {
    // Close the existing modal
    this.$activeModal.close()

    // Open the plugin config modal
    void this.$plugin.settings({
      name: this.plugin.name,
      settingsSchema: true,
      links: {},
    } as Plugin)
  }

  private generateUsername() {
    const hexDigits = '0123456789ABCDEF'
    let username = '0E:'
    for (let i = 0; i < 5; i += 1) {
      username += hexDigits.charAt(Math.round(Math.random() * 15))
      username += hexDigits.charAt(Math.round(Math.random() * 15))
      if (i !== 4) {
        username += ':'
      }
    }
    return username
  }

  public openFullConfigEditor() {
    void this.$router.navigate(['/config'])
    this.$activeModal.close()
  }

  public dismissModal() {
    this.$activeModal.dismiss('Dismiss')
  }

  public closeModal() {
    this.$activeModal.close('Dismiss')
  }

  /**
   * Load the hidePairingAlerts setting from the server
   */
  private async loadHidePairingAlerts(): Promise<void> {
    try {
      const hidePairingAlerts = await firstValueFrom(this.$api.get('/config-editor/ui/plugins/hide-pairing-alerts'))
      this.hidePairingAlerts = new Set(hidePairingAlerts)
    } catch (error) {
      console.error('Failed to load hide pairing alerts:', error)
    }
  }

  /**
   * Check if a specific bridge protocol is hidden
   */
  public isUnpairingHidden(username: string, protocol: 'hap'): boolean {
    return this.hidePairingAlerts.has(`${username}-${protocol}`.toUpperCase())
  }

  /**
   * Toggle hiding of unpairing for a specific bridge protocol
   */
  public async toggleHideUnpairing(username: string, protocol: 'hap'): Promise<void> {
    const identifier = `${username}-${protocol}`.toUpperCase()
    let currentSetting = Array.from(this.hidePairingAlerts)

    if (this.hidePairingAlerts.has(identifier)) {
      currentSetting = currentSetting.filter(x => x !== identifier)
    } else {
      currentSetting.push(identifier)
      currentSetting.sort()
    }

    try {
      await firstValueFrom(this.$api.put('/config-editor/ui/plugins/hide-pairing-alerts', {
        body: currentSetting,
      }))
      this.hidePairingAlerts = new Set(currentSetting)
      this.$settings.setEnvItem('plugins.hidePairingAlerts', currentSetting)
    } catch (error) {
      console.error('Failed to update hide pairing alerts:', error)
      this.$toastr.error(error.message, this.$translate.instant('toast.title_error'))
    }
  }
}
