import Link from 'next/link';
import { ButtonProps } from '@/types';
import { cn } from '@/lib/utils';

const Button = ({
  href,
  type = 'primary',
  size = 'small',
  children,
  onClick,
  className = '',
  disabled = false,
  isLoading = false,
}: ButtonProps) => {
  const baseStyles = 'inline-flex items-center font-medium rounded-full transition-colors duration-300';

  const typeStyles = {
    primary: 'text-white bg-custom-primary hover:bg-custom-primary-light',
    secondary: 'text-custom-primary bg-custom-secondary hover:bg-custom-secondary-dark',
    primaryOutline: 'text-custom-primary border border-neutral-300 hover:bg-neutral-200',
  };

  const sizeStyles = {
    small: 'px-[14px] py-2 text-[11px]',
    big: 'px-6 py-3 text-base',
    responsive: 'px-[14px] py-2 text-[11px] lg:px-6 lg:py-3 lg:text-base',
  };

  const buttonStyles = cn(`${baseStyles} ${typeStyles[type]} ${sizeStyles[size]} ${className} `, {
    'bg-neutral-300 text-neutral-400 hover:bg-neutral-300 hover:text-neutral-400 cursor-not-allowed': disabled,
    'cursor-not-allowed relative': isLoading,
  });

  const Loader = () => {
    return (
      <div className="h-6 w-6">
        <div className={cn("animate-spin rounded-full h-6 w-6 border-2", {
          'border-white border-t-transparent': type === 'primary' || type === 'secondary',
          'border-custom-primary border-t-transparent': type === 'primaryOutline',
        })}></div>
      </div>
    );
  }

  if (href) {
    return (
      <Link href={href} className={buttonStyles}>
        {children}
      </Link>
    );
  }

  return (
    <button onClick={onClick} className={buttonStyles} disabled={disabled || isLoading}>
      {isLoading ? <Loader /> : children}
    </button>
  );
};

export default Button;
