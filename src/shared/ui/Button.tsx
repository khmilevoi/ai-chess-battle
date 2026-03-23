import { forwardRef, type ComponentPropsWithoutRef } from 'react'
import clsx from 'clsx'
import styles from './Button.module.css'

type NativeButtonProps = ComponentPropsWithoutRef<'button'>

function createButton(displayName: string, variantClassName: string) {
  const Component = forwardRef<HTMLButtonElement, NativeButtonProps>(
    function ButtonComponent({ className, type = 'button', ...props }, ref) {
      return (
        <button
          {...props}
          ref={ref}
          type={type}
          className={clsx(styles.button, variantClassName, className)}
        />
      )
    },
  )

  Component.displayName = displayName

  return Component
}

export const Button = createButton('Button', styles.defaultButton)
export const PrimaryButton = createButton('PrimaryButton', styles.primaryButton)
export const SecondaryButton = createButton('SecondaryButton', styles.secondaryButton)
