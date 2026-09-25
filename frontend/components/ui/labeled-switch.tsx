import { Switch } from "@/components/ui/switch";

interface LabeledSwitchProps {
    checked: boolean;
    onCheckedChange: (checked: boolean) => void;
    label: string;
    description?: string;
    disabled?: boolean;
}

export function LabeledSwitch({
    checked,
    onCheckedChange,
    label,
    description,
    disabled,
}: LabeledSwitchProps) {
    return (
        <div className="flex items-center justify-between py-1">
            <div>
                <p className="text-sm font-medium text-foreground">{label}</p>
                {description && <p className="text-xs text-muted-foreground">{description}</p>}
            </div>
            <Switch
                checked={checked}
                onCheckedChange={onCheckedChange}
                disabled={disabled}
                aria-label={label}
            />
        </div>
    );
}