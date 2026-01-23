import { Component, inject } from '@angular/core'
import { FormControl, FormGroup, FormsModule, ReactiveFormsModule, Validators } from '@angular/forms'
import { NgbActiveModal, NgbAlert } from '@ng-bootstrap/ng-bootstrap'
import { TranslatePipe, TranslateService } from '@ngx-translate/core'
import { ToastrService } from 'ngx-toastr'

import { ApiService } from '@/app/core/api.service'
import { AuthService } from '@/app/core/auth/auth.service'
import { NotificationService } from '@/app/core/notification.service'

@Component({
  templateUrl: './users-2fa-disable.component.html',
  standalone: true,
  imports: [
    FormsModule,
    ReactiveFormsModule,
    TranslatePipe,
    NgbAlert,
  ],
})
export class Users2faDisableComponent {
  private $activeModal = inject(NgbActiveModal)
  private $api = inject(ApiService)
  private $auth = inject(AuthService)
  private $notification = inject(NotificationService)
  private $toastr = inject(ToastrService)
  private $translate = inject(TranslateService)

  public invalidCredentials = false
  public formGroup = new FormGroup({
    password: new FormControl('', [Validators.required]),
  })

  public disable2fa() {
    this.invalidCredentials = false
    this.$api.post('/users/otp/deactivate', this.formGroup.value).subscribe({
      next: async () => {
        this.$activeModal.close()
        this.$toastr.success(this.$translate.instant('users.setup_2fa_disable_success'), this.$translate.instant('toast.title_success'))

        // Clear the legacy OTP notification immediately
        this.$notification.legacyOtpDetected.next(false)

        // Force a token refresh to get updated user data without otpLegacySecret flag
        try {
          await this.$auth.refreshSession()
        } catch (err) {
          // Silently fail - the stale flag will be cleared on next login
          console.error('Failed to refresh session after disabling 2FA:', err)
        }
      },
      error: () => {
        this.formGroup.setValue({ password: '' })
        this.invalidCredentials = true
      },
    })
  }

  public dismissModal() {
    this.$activeModal.dismiss('Dismiss')
  }
}
