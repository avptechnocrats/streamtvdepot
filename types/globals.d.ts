declare global {
    interface Window {
        __profileRefetch?: () => void;
    }
}

export {};
