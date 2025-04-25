import React from 'react';
import Button from './Button';
import Image from 'next/image';

interface DialogModalProps {
  isOpen: boolean;
  title: string;
  children: React.ReactNode;
  buttonConfirmText?: string;
  buttonCancelText?: string;
  onClose?: () => void;
  onConfirm?: () => void;
  onCancel?: () => void;
  isConfirmDisabled?: boolean;
  isConfirmLoading?: boolean;
}

const DialogModal: React.FC<DialogModalProps> = ({ isOpen, title, children, buttonConfirmText, buttonCancelText, onClose, onConfirm, onCancel, isConfirmDisabled, isConfirmLoading }) => {
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 flex items-center justify-center bg-black bg-opacity-50">
      <div className="bg-white shadow-lg w-[calc(100%-32px)] lg:w-1/3">
        <div className="flex justify-between items-center px-8 lg:px-10 pt-8 lg:pt-10">
          <h2 className="text-4xl leading-[35.2px] tracking-[-1px]">{title}</h2>
          <button onClick={onClose} className="text-3xl text-gray-500 hover:text-gray-700">
            <Image src="/images/icons/nav-2.png" alt="Close" width={20} height={20} className="transform rotate-[45deg]" />
          </button>
        </div>
        <div className="px-8 lg:px-10">
          {children}
        </div>
        <div className="flex justify-start px-8 lg:px-10 gap-y-4 lg:gap-y-0 lg:gap-x-4 pb-8 lg:pb-10">
          {onConfirm && (
            <Button type="primary" size="big" className="lg:text-lg font-medium px-[44px] py-[14px] w-full lg:w-auto justify-center" onClick={onConfirm} disabled={isConfirmDisabled} isLoading={isConfirmLoading}>
              {buttonConfirmText || 'Confirm'}
            </Button>
          )}
          {onCancel && (
            <Button type="primaryOutline" size="big" className="lg:text-lg font-medium px-[44px] py-[14px] w-full lg:w-auto justify-center" onClick={onCancel}>
              {buttonCancelText || 'Cancel'}
            </Button>
          )}
        </div>
      </div>
    </div>
  );
};

export default DialogModal;
