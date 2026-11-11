import React from "react"
import { Link } from "gatsby"

export default function ReadingLink({ to, children, ...props }) {
  if (to.startsWith("/backend/transfer-performance/")) {
    return <a href={to} {...props}>{children}</a>
  }
  return <Link to={to} {...props}>{children}</Link>
}
