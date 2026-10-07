import { forwardRef, type InputHTMLAttributes } from "react";

/**
 * A text box that people never see, tab to or hear about, but a bot that fills every field fills in.
 * The server quietly drops anything submitted with it filled. Kept out of view with positioning, not
 * display:none, because some bots skip fields that are hidden that way.
 */
export const HoneypotField = forwardRef<HTMLInputElement, InputHTMLAttributes<HTMLInputElement>>(
  function HoneypotField(props, ref) {
    return (
      <div aria-hidden="true" style={{ position: "absolute", left: "-10000px", top: "auto", width: 1, height: 1, overflow: "hidden" }}>
        <label>
          Leave this field empty
          <input ref={ref} type="text" tabIndex={-1} autoComplete="off" data-testid="honeypot" {...props} />
        </label>
      </div>
    );
  },
);
