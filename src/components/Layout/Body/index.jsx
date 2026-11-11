import React from "react"

export default function Body({ children, wide }) {
  return <main id="main-content" tabIndex="-1" className={wide ? "journal-main wide" : "journal-main"}>{children}</main>
}
